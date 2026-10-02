# Phase 2 — Catalogue

**Goal:** browse → category → product works on the live site with real data from Neon.

Put this file at `docs/phase-2-setup.md`. Two branches, both created from `develop`:
- `feat/catalogue-api` — seed data + public catalogue endpoints
- `feat/catalogue-ui` — Home, Shop, Product pages

> Local and production currently share the **same Neon database**, so seeding locally also seeds production. That is fine for now. Later, create a Neon branch for local development.

---

# Part A — Backend: `feat/catalogue-api`

```bash
git checkout develop && git pull
git checkout -b feat/catalogue-api
cd backend
```

## A1. Error handling middleware

### `src/middleware/errorHandler.ts`

```ts
import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

// An error we throw on purpose, carrying an HTTP status and a machine-readable code
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Handler for any route that did not match
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

// Central error handler: every error leaves the API in the same shape
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Invalid request data (from Zod) → 422 with per-field details
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: err.issues.map((i) => ({ field: i.path.join("."), issue: i.message })),
      },
    });
  }

  // Errors we threw deliberately (404, 403, ...)
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // Anything else is unexpected: log it, hide the details from the client
  console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}
```

## A2. Catalogue module

### `src/modules/catalogue/schema.ts`

```ts
import { z } from "zod";

// Query string accepted by GET /products (all optional, with safe defaults)
export const listProductsQuery = z.object({
  category: z.string().optional(),
  color: z.string().optional(),
  size: z.coerce.number().int().optional(),
  featured: z.enum(["true", "false"]).optional(),
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(12),
});

export type ListProductsQuery = z.infer<typeof listProductsQuery>;
```

### `src/modules/catalogue/service.ts`

```ts
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ListProductsQuery } from "./schema.js";

// A product row together with its category
type ProductWithCategory = Prisma.ProductGetPayload<{ include: { category: true } }>;

// Convert a database row into the short shape used in product lists
function toSummary(p: ProductWithCategory) {
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    category: { name: p.category.name, slug: p.category.slug },
    thumbnail: p.images[0] ?? null,
    colors: p.colors,
    priceNgn: p.priceNgn,
    isCustomizable: p.isCustomizable,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    isPopular: p.isPopular,
  };
}

// Convert a database row into the full shape used on the product page
function toDetail(p: ProductWithCategory) {
  return { ...toSummary(p), description: p.description, images: p.images, sizes: p.sizes };
}

// Active categories in display order
export async function listCategories() {
  return prisma.category.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: "asc" },
    select: { id: true, name: true, slug: true, description: true, imageUrl: true },
  });
}

// Published products with filters and pagination
export async function listProducts(q: ListProductsQuery) {
  // Build the filter from whichever query params were provided
  const where: Prisma.ProductWhereInput = {
    isPublished: true,
    category: { isActive: true, ...(q.category ? { slug: q.category } : {}) },
    ...(q.size ? { sizes: { has: q.size } } : {}),
    ...(q.color ? { colors: { array_contains: [{ name: q.color }] } } : {}), // case-sensitive, e.g. "Black"
    ...(q.featured === "true" ? { isFeatured: true } : {}),
    ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
  };

  // Count and fetch the current page in one round trip
  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: true },
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return { items: rows.map(toSummary), page: q.page, pageSize: q.pageSize, total };
}

// One published product by its slug (null if missing or unpublished)
export async function getProductBySlug(slug: string) {
  const product = await prisma.product.findFirst({
    where: { slug, isPublished: true },
    include: { category: true },
  });
  return product ? toDetail(product) : null;
}
```

### `src/modules/catalogue/controller.ts`

```ts
import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { listProductsQuery } from "./schema.js";
import * as service from "./service.js";

// GET /categories
export async function getCategories(_req: Request, res: Response) {
  res.json({ items: await service.listCategories() });
}

// GET /products — validate the query string, then fetch
export async function getProducts(req: Request, res: Response) {
  const query = listProductsQuery.parse(req.query);
  res.json(await service.listProducts(query));
}

// GET /products/:slug — 404 if it does not exist
export async function getProduct(req: Request, res: Response) {
  const product = await service.getProductBySlug(String(req.params.slug));
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found");
  res.json(product);
}
```

> These async handlers rely on Express 5 (the default from `npm i express`), which forwards thrown errors to the error handler automatically. Check with `npm ls express`; if it shows 4.x, run `npm i express@5`.

### `src/modules/catalogue/routes.ts`

```ts
import { Router } from "express";
import { getCategories, getProduct, getProducts } from "./controller.js";

// Public, read-only catalogue routes
export const catalogueRouter = Router();

catalogueRouter.get("/categories", getCategories);
catalogueRouter.get("/products", getProducts);
catalogueRouter.get("/products/:slug", getProduct);
```

## A3. Update `src/app.ts` (full file)

```ts
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { catalogueRouter } from "./modules/catalogue/routes.js";

// Create the Express app
export const app = express();

// Trust the hosting proxy (Render) so secure cookies and client IPs work correctly
app.set("trust proxy", 1);

// Global middleware: security headers, JSON body parsing, cookie parsing
// NOTE (Phase 6): mount the Paystack webhook BEFORE express.json() using express.raw(),
// so its signature can be verified against the raw body.
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check: confirms the API is up and can reach the database
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// Feature routes (each phase adds one here)
app.use("/api/v1", catalogueRouter);

// 404 for unmatched routes, then the central error handler (must stay last)
app.use(notFound);
app.use(errorHandler);
```

## A4. Seed script

### `prisma/seed.ts`

```ts
// Seed script: inserts sample categories and products. Safe to run more than once (uses upsert).
// All names, prices and images are PLACEHOLDERS to be replaced with PFC's real data.
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Placeholder image URL (swap for real Cloudinary photos later)
const img = (label: string) =>
  `https://placehold.co/800x800.png?text=${encodeURIComponent(label).replace(/%20/g, "+")}`;

// Reusable colors
const COLORS = {
  black: { name: "Black", hex: "#111111" },
  brown: { name: "Brown", hex: "#6b4423" },
  white: { name: "White", hex: "#f5f5f5" },
  navy: { name: "Navy", hex: "#1f2a44" },
  tan: { name: "Tan", hex: "#c8a165" },
  red: { name: "Red", hex: "#b3261e" },
};

// Size range helper: range(38, 46) → [38, 39, ..., 46]
const range = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, i) => from + i);

// Categories shown on the site
const categories = [
  { name: "Shoes", slug: "shoes", description: "Formal and casual shoes", sortOrder: 1 },
  { name: "Slides", slug: "slides", description: "Comfortable everyday slides", sortOrder: 2 },
  { name: "Sandals", slug: "sandals", description: "Durable leather and gladiator sandals", sortOrder: 3 },
  { name: "Slippers", slug: "slippers", description: "Soft home and indoor slippers", sortOrder: 4 },
];

// Sample products (priceNgn is in whole naira)
const products = [
  {
    name: "PFC Classic Slide", slug: "pfc-classic-slide", categorySlug: "slides", priceNgn: 8500,
    description: "Our best-selling everyday slide with a soft footbed and durable sole.",
    colors: [COLORS.black, COLORS.brown, COLORS.white], sizes: range(38, 46),
    isFeatured: true, isPopular: true, isNew: false,
  },
  {
    name: "PFC Cushion Slide", slug: "pfc-cushion-slide", categorySlug: "slides", priceNgn: 9500,
    description: "Extra-thick cushioned slide for all-day comfort.",
    colors: [COLORS.black, COLORS.navy], sizes: range(38, 46),
    isFeatured: false, isPopular: false, isNew: true,
  },
  {
    name: "PFC Leather Sandal", slug: "pfc-leather-sandal", categorySlug: "sandals", priceNgn: 12000,
    description: "Handcrafted leather sandal with adjustable straps.",
    colors: [COLORS.brown, COLORS.tan, COLORS.black], sizes: range(39, 46),
    isFeatured: false, isPopular: true, isNew: false,
  },
  {
    name: "PFC Gladiator Sandal", slug: "pfc-gladiator-sandal", categorySlug: "sandals", priceNgn: 11000,
    description: "Strappy gladiator-style sandal, light and breathable.",
    colors: [COLORS.tan, COLORS.black], sizes: range(36, 42),
    isFeatured: true, isPopular: false, isNew: false,
  },
  {
    name: "PFC Home Slipper", slug: "pfc-home-slipper", categorySlug: "slippers", priceNgn: 6000,
    description: "Lightweight indoor slipper that is easy to slip on and off.",
    colors: [COLORS.navy, COLORS.black, COLORS.red], sizes: range(36, 46),
    isFeatured: false, isPopular: false, isNew: false,
  },
  {
    name: "PFC Plush Slipper", slug: "pfc-plush-slipper", categorySlug: "slippers", priceNgn: 7000,
    description: "Warm plush-lined slipper for cool evenings.",
    colors: [COLORS.white, COLORS.tan], sizes: range(36, 44),
    isFeatured: false, isPopular: true, isNew: false,
  },
  {
    name: "PFC Oxford Shoe", slug: "pfc-oxford-shoe", categorySlug: "shoes", priceNgn: 22000,
    description: "Classic leather oxford for office and formal events.",
    colors: [COLORS.black, COLORS.brown], sizes: range(40, 46),
    isFeatured: true, isPopular: false, isNew: false,
  },
  {
    name: "PFC Casual Loafer", slug: "pfc-casual-loafer", categorySlug: "shoes", priceNgn: 19000,
    description: "Smart-casual slip-on loafer with a flexible sole.",
    colors: [COLORS.brown, COLORS.navy], sizes: range(40, 46),
    isFeatured: false, isPopular: false, isNew: true,
  },
];

async function main() {
  // Create or update categories, remembering each id by slug
  const categoryIds: Record<string, string> = {};
  for (const c of categories) {
    const row = await prisma.category.upsert({
      where: { slug: c.slug },
      update: { name: c.name, description: c.description, sortOrder: c.sortOrder },
      create: c,
    });
    categoryIds[c.slug] = row.id;
  }

  // Create or update products (3 placeholder photos each)
  for (const p of products) {
    const { categorySlug, ...rest } = p;
    const data = {
      ...rest,
      categoryId: categoryIds[categorySlug],
      images: [img(p.name), img(`${p.name} side`), img(`${p.name} back`)],
      isCustomizable: true,
      isPublished: true,
    };
    await prisma.product.upsert({ where: { slug: p.slug }, update: data, create: data });
  }

  console.log(`Seeded ${categories.length} categories and ${products.length} products`);
}

// Run, report failures, and always close the database connection
main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
```

### Tell Prisma how to run it — add to `backend/package.json`

```json
"prisma": {
  "seed": "tsx prisma/seed.ts"
}
```

## A5. Run and test

```bash
npx prisma db seed
npm run dev
```

In another terminal:

```bash
curl http://localhost:8000/api/v1/categories
curl "http://localhost:8000/api/v1/products?category=slides"
curl "http://localhost:8000/api/v1/products?featured=true&pageSize=4"
curl http://localhost:8000/api/v1/products/pfc-classic-slide
curl http://localhost:8000/api/v1/products/does-not-exist     # → 404 NOT_FOUND
curl "http://localhost:8000/api/v1/products?page=0"           # → 422 VALIDATION_ERROR
```

Commit and merge:

```bash
cd ..
git add . && git commit -m "feat(backend): catalogue endpoints, error handler and seed script"
git push -u origin feat/catalogue-api
git checkout develop && git merge --no-ff feat/catalogue-api && git push
```

---

# Part B — Frontend: `feat/catalogue-ui`

```bash
git checkout -b feat/catalogue-ui
cd frontend
```

## B1. `next.config.ts` — allow placeholder images

Add `placehold.co` to `remotePatterns`:

```ts
images: {
  remotePatterns: [
    { protocol: "https", hostname: "res.cloudinary.com" },
    { protocol: "https", hostname: "placehold.co" },
  ],
},
```

## B2. Types, API helper, formatter

### `src/lib/api/types.ts`

```ts
// Shapes returned by the Express API (keep in sync with docs/api-contract.md)

export type Color = { name: string; hex: string };

export type Category = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
};

export type ProductSummary = {
  id: string;
  name: string;
  slug: string;
  category: { name: string; slug: string };
  thumbnail: string | null;
  colors: Color[];
  priceNgn: number;
  isCustomizable: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
};

export type ProductDetail = ProductSummary & {
  description: string;
  images: string[];
  sizes: number[];
};

export type Paginated<T> = { items: T[]; page: number; pageSize: number; total: number };
```

### `src/lib/api/client.ts`

```ts
// Server-side helper for calling the Express API from Next.js server components.
// (Browser code calls the relative /api/... path instead, which goes through the rewrite.)

// Backend base URL, with any trailing slash removed
const BACKEND = (process.env.BACKEND_URL ?? "http://localhost:8000").replace(/\/+$/, "");

// Error carrying the HTTP status so pages can react (e.g. 404 → notFound())
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

// GET a JSON resource from the API; never cached for now (so builds don't depend on the backend being awake)
export async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BACKEND}/api/v1${path}`, { cache: "no-store" });
  if (!res.ok) throw new ApiError(res.status, `API ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}
```

### `src/lib/format.ts`

```ts
// Format a whole-naira amount, e.g. 8500 → "₦8,500"
export function formatNgn(amount: number): string {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(amount);
}
```

## B3. Components

### `src/components/layout/Header.tsx`

```tsx
import Link from "next/link";

// Main navigation links shown on every page
const links = [
  { href: "/shop", label: "Shop" },
  { href: "/custom-design", label: "Custom Design" },
  { href: "/how-to-order", label: "How to Order" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        {/* Brand / home link */}
        <Link href="/" className="text-lg font-bold tracking-tight">
          PFC
        </Link>

        {/* Page links */}
        <nav className="flex flex-wrap gap-4 text-sm text-gray-700">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-black">
              {l.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
```

### `src/components/layout/Footer.tsx`

```tsx
export default function Footer() {
  return (
    <footer className="mt-16 border-t border-gray-200 bg-gray-50">
      <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-gray-600">
        © {new Date().getFullYear()} PAT Footwear Collection (PFC). All rights reserved.
      </div>
    </footer>
  );
}
```

### `src/components/product/ProductCard.tsx`

```tsx
import Image from "next/image";
import Link from "next/link";
import type { ProductSummary } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

// Card shown in product grids: image, name, category, color dots, price
export default function ProductCard({ product }: { product: ProductSummary }) {
  return (
    <Link
      href={`/product/${product.slug}`}
      className="group block overflow-hidden rounded-lg border border-gray-200 bg-white transition hover:shadow-md"
    >
      {/* Product image */}
      <div className="relative aspect-square bg-gray-100">
        {product.thumbnail && (
          <Image
            src={product.thumbnail}
            alt={product.name}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
            className="object-cover transition group-hover:scale-105"
          />
        )}
        {product.isNew && (
          <span className="absolute left-2 top-2 rounded bg-black px-2 py-0.5 text-xs text-white">New</span>
        )}
      </div>

      {/* Text details */}
      <div className="p-3">
        <p className="text-xs uppercase tracking-wide text-gray-500">{product.category.name}</p>
        <h3 className="mt-1 font-medium">{product.name}</h3>

        {/* Available colors */}
        <div className="mt-2 flex gap-1" aria-label="Available colors">
          {product.colors.map((c) => (
            <span
              key={c.name}
              title={c.name}
              className="h-4 w-4 rounded-full border border-gray-300"
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>

        <p className="mt-2 font-semibold">{formatNgn(product.priceNgn)}</p>
      </div>
    </Link>
  );
}
```

## B4. Layout — wrap pages with header and footer

Open `src/app/layout.tsx` (generated by Next.js). **Keep its fonts and imports**; change only these parts:

```tsx
// add with the other imports
import Header from "@/components/layout/Header";
import Footer from "@/components/layout/Footer";

// update the metadata
export const metadata: Metadata = {
  title: { default: "PAT Footwear Collection", template: "%s | PFC" },
  description: "Shoes, slides, sandals and slippers made by PAT Footwear Collection. Order online or request a custom design.",
};

// inside <body ...>, wrap {children}:
<Header />
<main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
<Footer />
```

(Because the layout now provides `<main>`, the pages below use `<div>` instead.)

## B5. Pages

### `src/app/page.tsx` — Home (replaces the health-check page)

```tsx
import Image from "next/image";
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { apiGet } from "@/lib/api/client";
import type { Category, Paginated, ProductSummary } from "@/lib/api/types";

export default async function Home() {
  // Fetch categories and featured products at the same time
  const [categories, featured] = await Promise.all([
    apiGet<{ items: Category[] }>("/categories"),
    apiGet<Paginated<ProductSummary>>("/products?featured=true&pageSize=4"),
  ]);

  return (
    <div className="space-y-14">
      {/* Hero */}
      <section className="rounded-xl bg-gray-900 px-6 py-16 text-center text-white">
        <h1 className="text-3xl font-bold sm:text-5xl">PAT Footwear Collection</h1>
        <p className="mx-auto mt-4 max-w-xl text-gray-300">
          Quality shoes, slides, sandals and slippers, made by us. Order from our collection or send us your own design.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href="/shop" className="rounded bg-white px-5 py-3 font-medium text-black">
            Explore Collection
          </Link>
          <Link href="/custom-design" className="rounded border border-white px-5 py-3 font-medium">
            Create Custom Order
          </Link>
        </div>
      </section>

      {/* Category navigation */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Shop by category</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {categories.items.map((c) => (
            <Link
              key={c.id}
              href={`/shop?category=${c.slug}`}
              className="rounded-lg border border-gray-200 p-5 text-center font-medium hover:bg-gray-50"
            >
              {c.name}
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section>
        <h2 className="mb-4 text-xl font-semibold">Featured</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {featured.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      </section>
    </div>
  );
}
```

> If your editor flags the unused `Image` import in this file, delete that line.

### `src/app/shop/page.tsx` — Catalogue with category filter + pagination

```tsx
import Link from "next/link";
import ProductCard from "@/components/product/ProductCard";
import { apiGet } from "@/lib/api/client";
import type { Category, Paginated, ProductSummary } from "@/lib/api/types";

export const metadata = { title: "Shop" };

// In Next.js 15+, searchParams is a Promise
type Props = { searchParams: Promise<{ category?: string; page?: string }> };

export default async function ShopPage({ searchParams }: Props) {
  const { category, page } = await searchParams;
  const currentPage = Math.max(1, Number(page) || 1);

  // Build the API query from the URL
  const qs = new URLSearchParams({ page: String(currentPage), pageSize: "12" });
  if (category) qs.set("category", category);

  // Fetch categories and products at the same time
  const [categories, products] = await Promise.all([
    apiGet<{ items: Category[] }>("/categories"),
    apiGet<Paginated<ProductSummary>>(`/products?${qs.toString()}`),
  ]);

  const totalPages = Math.max(1, Math.ceil(products.total / products.pageSize));

  // Helper for building pagination links that keep the selected category
  const pageHref = (p: number) => `/shop?${new URLSearchParams({ ...(category ? { category } : {}), page: String(p) })}`;

  return (
    <div>
      <h1 className="text-2xl font-bold">Shop</h1>

      {/* Category filter chips */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Link
          href="/shop"
          className={`rounded-full border px-4 py-1 text-sm ${!category ? "bg-black text-white" : "hover:bg-gray-50"}`}
        >
          All
        </Link>
        {categories.items.map((c) => (
          <Link
            key={c.id}
            href={`/shop?category=${c.slug}`}
            className={`rounded-full border px-4 py-1 text-sm ${category === c.slug ? "bg-black text-white" : "hover:bg-gray-50"}`}
          >
            {c.name}
          </Link>
        ))}
      </div>

      {/* Product grid (or an empty state) */}
      {products.items.length === 0 ? (
        <p className="mt-10 text-gray-600">No products found.</p>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
          {products.items.map((p) => (
            <ProductCard key={p.id} product={p} />
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="mt-8 flex items-center justify-center gap-4 text-sm">
          {currentPage > 1 && <Link href={pageHref(currentPage - 1)}>← Previous</Link>}
          <span>
            Page {currentPage} of {totalPages}
          </span>
          {currentPage < totalPages && <Link href={pageHref(currentPage + 1)}>Next →</Link>}
        </div>
      )}
    </div>
  );
}
```

### `src/app/shop/[category]/page.tsx` — pretty URL redirects to the filter

```tsx
import { redirect } from "next/navigation";

// /shop/slides → /shop?category=slides
export default async function CategoryPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  redirect(`/shop?category=${encodeURIComponent(category)}`);
}
```

### `src/app/product/[slug]/page.tsx` — Product detail

```tsx
import Image from "next/image";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ApiError, apiGet } from "@/lib/api/client";
import type { ProductDetail } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

type Props = { params: Promise<{ slug: string }> };

// Fetch one product; a 404 from the API becomes Next.js's not-found page
async function getProduct(slug: string): Promise<ProductDetail> {
  try {
    return await apiGet<ProductDetail>(`/products/${encodeURIComponent(slug)}`);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }
}

// Page title and description for SEO
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const p = await getProduct(slug);
  return { title: p.name, description: p.description };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  const p = await getProduct(slug);

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Image gallery: large first image, then the rest as thumbnails */}
      <div>
        <div className="relative aspect-square overflow-hidden rounded-lg bg-gray-100">
          {p.images[0] && (
            <Image src={p.images[0]} alt={p.name} fill priority sizes="(max-width: 768px) 100vw, 50vw" className="object-cover" />
          )}
        </div>
        <div className="mt-3 grid grid-cols-4 gap-2">
          {p.images.slice(1).map((src, i) => (
            <div key={src} className="relative aspect-square overflow-hidden rounded bg-gray-100">
              <Image src={src} alt={`${p.name} view ${i + 2}`} fill sizes="25vw" className="object-cover" />
            </div>
          ))}
        </div>
      </div>

      {/* Product information */}
      <div>
        <p className="text-sm uppercase tracking-wide text-gray-500">{p.category.name}</p>
        <h1 className="mt-1 text-3xl font-bold">{p.name}</h1>
        <p className="mt-3 text-2xl font-semibold">{formatNgn(p.priceNgn)}</p>
        <p className="mt-4 text-gray-700">{p.description}</p>

        {/* Available colors */}
        <h2 className="mt-6 font-medium">Colors</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.colors.map((c) => (
            <span key={c.name} className="flex items-center gap-2 rounded-full border px-3 py-1 text-sm">
              <span className="h-3 w-3 rounded-full border" style={{ backgroundColor: c.hex }} />
              {c.name}
            </span>
          ))}
        </div>

        {/* Available sizes */}
        <h2 className="mt-6 font-medium">Sizes</h2>
        <div className="mt-2 flex flex-wrap gap-2">
          {p.sizes.map((s) => (
            <span key={s} className="rounded border px-3 py-1 text-sm">
              {s}
            </span>
          ))}
        </div>

        {/* Whether custom requests are supported */}
        <p className="mt-6 text-sm text-gray-600">
          {p.isCustomizable ? "Custom requests supported for this style." : "Custom requests are not available for this style."}
        </p>

        {/* Placeholder until Phase 3 adds the configurator and cart */}
        <button disabled className="mt-6 w-full rounded bg-gray-300 px-5 py-3 font-medium text-gray-600">
          Order options coming next
        </button>
      </div>
    </div>
  );
}
```

## B6. Placeholder pages

The scaffold script created `cart`, `checkout`, `about`, etc. with a `TODO` body. They don't need to change yet, but because the layout now provides `<main>`, nothing breaks if they keep their own `<main>`.

## B7. Run and commit

```bash
# terminal 1 (backend) and terminal 2 (frontend)
cd backend && npm run dev
cd frontend && npm run dev
```

Check http://localhost:3000, then `/shop`, `/shop?category=slides`, a product page, and a bad slug such as `/product/nope` (should show the 404 page).

```bash
git add . && git commit -m "feat(frontend): home, shop and product pages with layout"
git push -u origin feat/catalogue-ui
git checkout develop && git merge --no-ff feat/catalogue-ui && git push
```

## Step 9 — Release to production

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

Render and Vercel redeploy automatically. The seed data is already in the shared Neon database.

## Done when

- [ ] `https://pfc-shop.vercel.app` shows the hero, categories and 4 featured products
- [ ] `/shop` filters by category and paginates
- [ ] A product page opens with images, colors, sizes and price in ₦
- [ ] `agent.md` Phase 2 boxes ticked and a Progress Log row added

## Next: Phase 3 — Google Auth, then Phase 4 (cart + checkout)

Order of work for the deadline: Google Auth → cart + checkout + orders in DB → Mailgun, then the submission checkpoint.