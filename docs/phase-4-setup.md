# Phase 4 — Cart, Checkout & Orders saved to Neon (HNG requirements 1 + 2 ⭐)

**Goal:** a customer picks a color and sizes on a product page, adds it to the cart, fills in the checkout form, and the order is **saved in Neon**. They land on an order confirmation page with the order reference and a "Send on WhatsApp" button.

Put this file at `docs/phase-4-setup.md`. Two branches, both from `develop`:

- `feat/orders-api` — backend (validation, price calculation, saving, WhatsApp link)
- `feat/cart-checkout` — frontend (configurator, cart, checkout, confirmation)

**Scope for this phase:** catalogue orders only (`type: "CATALOGUE"`). Payment is added in Phase 6 and emails in Phase 5, so for now the confirmation page says "payment coming soon". Custom designs come in Phase 9.

**Rules the code follows (agent.md D9, D10):**

- The server **never trusts prices or totals from the browser**. It loads each product from Neon and recomputes everything.
- Each order item stores a **snapshot** of the product name and price, so old orders stay correct if a product changes later.
- Guests can check out. If the customer is signed in, the order is linked to their account.

---

# Part A — Backend: `feat/orders-api`

```bash
git checkout develop && git pull
git checkout -b feat/orders-api
cd backend
npm i express-rate-limit
```

## A1. `src/config/env.ts` — add one variable

Add this line inside the `z.object({ ... })` (next to the Google settings):

```ts
  // PFC's WhatsApp number in international format, digits only (e.g. 2348012345678). Optional.
  PFC_WHATSAPP_NUMBER: z.string().default(""),
```

Add to `backend/.env` and `backend/.env.example`:

```
PFC_WHATSAPP_NUMBER=234XXXXXXXXXX
```

(Use your own number as the placeholder for now, digits only, no `+`.)

## A2. `src/utils/reference.ts`

```ts
import { randomInt } from "node:crypto";

// Human-friendly order reference, e.g. PFC-20261003-0427
export function generateReference(date = new Date()): string {
  // Today's date as YYYYMMDD
  const ymd = date.toISOString().slice(0, 10).replaceAll("-", "");

  // Random 4-digit suffix (the database enforces uniqueness; the service retries on a clash)
  const suffix = String(randomInt(0, 10000)).padStart(4, "0");

  return `PFC-${ymd}-${suffix}`;
}
```

## A3. `src/lib/orderToken.ts`

```ts
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

const secret = new TextEncoder().encode(env.JWT_SECRET);

// A signed link-token that lets a GUEST view their own order (valid 30 days)
export async function signOrderToken(orderId: string): Promise<string> {
  return new SignJWT({ purpose: "order" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(orderId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secret);
}

// Returns the order id inside a valid order token, or null (the "purpose" check stops login tokens being reused here)
export async function verifyOrderToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.purpose === "order" ? (payload.sub ?? null) : null;
  } catch {
    return null;
  }
}
```

## A4. `src/middleware/rateLimit.ts`

```ts
import rateLimit from "express-rate-limit";

// Limit order creation to 20 requests per 15 minutes per IP (stops spam and accidental loops)
export const orderLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests, please try again shortly",
        },
      });
  },
});
```

## A5. `src/services/whatsapp.ts`

```ts
import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Plain-text order message customers can send to PFC on WhatsApp
export function buildWhatsappMessage(order: OrderWithItems): string {
  const lines: string[] = [`Hello PFC, I placed order ${order.reference}.`];

  // One block per item: product, color, then each size with its quantity
  for (const item of order.items) {
    lines.push(
      "",
      `Product: ${item.productNameSnapshot}${item.color ? ` | ${item.color}` : ""}`,
    );
    const sizes = item.sizeBreakdown as Record<string, number>;
    for (const [size, qty] of Object.entries(sizes)) {
      lines.push(`Size ${size}: ${qty} pair${qty === 1 ? "" : "s"}`);
    }
  }

  // Totals and customer details
  lines.push("", `Total: ${order.totalQuantity} pairs`);
  if (order.subtotalNgn != null)
    lines.push(`Amount: ₦${order.subtotalNgn.toLocaleString("en-NG")}`);
  if (order.instructions) lines.push(`Notes: ${order.instructions}`);
  lines.push("", `Name: ${order.customerName} | Phone: ${order.customerPhone}`);
  if (order.location) lines.push(`Location: ${order.location}`);

  return lines.join("\n");
}

// wa.me link with the message pre-filled; null if no PFC number is configured
export function buildWhatsappUrl(order: OrderWithItems): string | null {
  const number = env.PFC_WHATSAPP_NUMBER.replace(/\D/g, "");
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsappMessage(order))}`;
}
```

## A6. `src/modules/orders/schema.ts`

```ts
import { z } from "zod";

// Phone: remove spaces/dashes, then require 10–15 digits with an optional leading +
const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"));

// Email is optional; an empty string counts as "not provided"
const optionalEmail = z
  .union([
    z.literal(""),
    z.string().trim().email("Enter a valid email address"),
  ])
  .optional()
  .transform((v) => v || undefined);

// Body of POST /orders (catalogue orders; custom designs are added in Phase 9)
export const createOrderBody = z.object({
  type: z.literal("CATALOGUE"),
  customer: z.object({
    name: z.string().trim().min(2, "Enter your name").max(100),
    phone,
    email: optionalEmail,
    location: z.string().trim().max(200).optional(),
  }),
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        color: z.string().trim().min(1).max(50),
        // e.g. { "40": 3, "41": 5 } — sizes are validated against the product in the service
        sizeBreakdown: z.record(z.string(), z.number().int().min(0).max(1000)),
      }),
    )
    .min(1, "Your cart is empty")
    .max(20),
  instructions: z.string().trim().max(1000).optional(),
});

export type CreateOrderBody = z.infer<typeof createOrderBody>;
```

## A7. `src/modules/orders/service.ts`

```ts
import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { generateReference } from "../../utils/reference.js";
import type { CreateOrderBody } from "./schema.js";

type ColorOption = { name: string; hex: string };

// Create an order. Prices and totals come from the database, never from the request.
export async function createOrder(input: CreateOrderBody, userId?: string) {
  // Load every product in the request (only published ones count)
  const ids = [...new Set(input.items.map((i) => i.productId))];
  const products = await prisma.product.findMany({
    where: { id: { in: ids }, isPublished: true },
    include: { category: true },
  });
  const byId = new Map(products.map((p) => [p.id, p]));

  // Check each line and work out its quantity and price
  let totalQuantity = 0;
  let subtotalNgn = 0;
  const lines = input.items.map((item) => {
    const product = byId.get(item.productId);
    if (!product)
      throw new HttpError(
        422,
        "INVALID_PRODUCT",
        "A product in your cart is no longer available",
      );

    // The chosen color must be one the product offers
    const colors = product.colors as unknown as ColorOption[];
    if (!colors.some((c) => c.name === item.color)) {
      throw new HttpError(
        422,
        "INVALID_COLOR",
        `${product.name} is not available in ${item.color}`,
      );
    }

    // Keep only sizes with a quantity, and make sure each size exists for this product
    const sizeBreakdown: Record<string, number> = {};
    let quantity = 0;
    for (const [size, qty] of Object.entries(item.sizeBreakdown)) {
      if (qty <= 0) continue;
      if (!product.sizes.includes(Number(size))) {
        throw new HttpError(
          422,
          "INVALID_SIZE",
          `Size ${size} is not available for ${product.name}`,
        );
      }
      sizeBreakdown[size] = qty;
      quantity += qty;
    }
    if (quantity === 0)
      throw new HttpError(
        422,
        "EMPTY_ITEM",
        `Choose at least one size for ${product.name}`,
      );

    totalQuantity += quantity;
    subtotalNgn += quantity * product.priceNgn;
    return { product, color: item.color, sizeBreakdown, quantity };
  });

  // Save the order and its items together. Retry if the random reference collides (very rare).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.order.create({
        data: {
          reference: generateReference(),
          userId: userId ?? undefined,
          type: "CATALOGUE",
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          location: input.customer.location || undefined,
          instructions: input.instructions || undefined,
          totalQuantity,
          subtotalNgn,
          items: {
            create: lines.map((l) => ({
              productId: l.product.id,
              productNameSnapshot: l.product.name,
              categorySnapshot: l.product.category.name,
              unitPriceNgn: l.product.priceNgn,
              color: l.color,
              sizeBreakdown: l.sizeBreakdown,
              quantity: l.quantity,
            })),
          },
        },
        include: { items: true },
      });
    } catch (e) {
      // P2002 = unique constraint violation (reference already used) → try again with a new reference
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        continue;
      throw e;
    }
  }
  throw new HttpError(
    500,
    "REFERENCE_FAILED",
    "Could not create your order, please try again",
  );
}

// Find an order (with items) by its public reference
export async function findOrderByReference(reference: string) {
  return prisma.order.findUnique({
    where: { reference },
    include: { items: true },
  });
}
```

## A8. `src/modules/orders/controller.ts`

```ts
import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { signOrderToken, verifyOrderToken } from "../../lib/orderToken.js";
import { buildWhatsappUrl } from "../../services/whatsapp.js";
import { createOrderBody } from "./schema.js";
import * as service from "./service.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Shape returned to the frontend for an order
function toOrderDetail(order: OrderWithItems) {
  return {
    id: order.id,
    reference: order.reference,
    type: order.type,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    location: order.location,
    instructions: order.instructions,
    totalQuantity: order.totalQuantity,
    subtotalNgn: order.subtotalNgn,
    createdAt: order.createdAt,
    items: order.items.map((i) => ({
      id: i.id,
      productName: i.productNameSnapshot,
      color: i.color,
      sizeBreakdown: i.sizeBreakdown as Record<string, number>,
      quantity: i.quantity,
      unitPriceNgn: i.unitPriceNgn,
    })),
    whatsappUrl: buildWhatsappUrl(order),
  };
}

// POST /orders — validate, save, and return the order with a guest access token
export async function createOrder(req: Request, res: Response) {
  const body = createOrderBody.parse(req.body);
  const order = await service.createOrder(body, req.user?.id);
  const accessToken = await signOrderToken(order.id);
  res.status(201).json({ ...toOrderDetail(order), accessToken });
}

// GET /orders/:reference?token= — allowed with a valid token, or for the owner / an admin
export async function getOrder(req: Request, res: Response) {
  const order = await service.findOrderByReference(
    String(req.params.reference),
  );

  // Same 404 for "missing" and "not yours" so references can't be guessed
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found");

  const token = typeof req.query.token === "string" ? req.query.token : null;
  const tokenOrderId = token ? await verifyOrderToken(token) : null;
  const isOwner = !!req.user && req.user.id === order.userId;
  const isAdmin = req.user?.role === "ADMIN";
  if (tokenOrderId !== order.id && !isOwner && !isAdmin) {
    throw new HttpError(404, "NOT_FOUND", "Order not found");
  }

  res.json(toOrderDetail(order));
}
```

## A9. `src/modules/orders/routes.ts`

```ts
import { Router } from "express";
import { orderLimiter } from "../../middleware/rateLimit.js";
import { createOrder, getOrder } from "./controller.js";

// Order routes (guests allowed; attachUser in app.ts links the order to a signed-in user)
export const ordersRouter = Router();

ordersRouter.post("/orders", orderLimiter, createOrder);
ordersRouter.get("/orders/:reference", getOrder);
```

## A10. `src/app.ts` — register the router

Add the import with the others:

```ts
import { ordersRouter } from "./modules/orders/routes.js";
```

and add the line right after `app.use("/api/v1", catalogueRouter);` (keep the other Phase 3 routes as they are; `attachUser` must stay above it):

```ts
app.use("/api/v1", ordersRouter);
```

## A11. Test the backend

```bash
npm run dev
```

Get a real product id and size first:

```bash
curl "http://localhost:8000/api/v1/products?pageSize=1"
```

Copy the `id`, a color `name` and a size from `/products/<slug>`, then:

```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CATALOGUE",
    "customer": { "name": "Test User", "phone": "08012345678", "email": "", "location": "Minna" },
    "items": [ { "productId": "PASTE-ID", "color": "Black", "sizeBreakdown": { "40": 2, "41": 1 } } ],
    "instructions": "Test order"
  }'
```

Expected: `201` with a `reference` like `PFC-20261003-0427`, `totalQuantity: 3`, a `subtotalNgn` that matches price × 3, an `accessToken` and a `whatsappUrl`.

Then check the failure cases:

```bash
# bad size → 422 INVALID_SIZE (change "40" to "99")
# bad phone → 422 VALIDATION_ERROR (use "123")
# empty items → 422 VALIDATION_ERROR (use "items": [])
# read it back (use your reference and token):
curl "http://localhost:8000/api/v1/orders/PFC-XXXX?token=PASTE-TOKEN"
# without a token → 404
curl "http://localhost:8000/api/v1/orders/PFC-XXXX"
```

Open Neon → Tables → `Order` / `OrderItem` (or run `npx prisma studio`) and confirm the row is there.

```bash
cd ..
git add . && git commit -m "feat(backend): orders api with server-side pricing, order tokens and whatsapp link"
git push -u origin feat/orders-api
git checkout develop && git merge --no-ff feat/orders-api && git push
```

---

# Part B — Frontend: `feat/cart-checkout`

```bash
git checkout -b feat/cart-checkout
cd frontend
npm i zustand
```

## B1. `src/lib/api/types.ts` — add at the bottom

```ts
// An order as returned by POST /orders and GET /orders/:reference
export type OrderItemDetail = {
  id: string;
  productName: string;
  color: string | null;
  sizeBreakdown: Record<string, number>;
  quantity: number;
  unitPriceNgn: number | null;
};

export type OrderDetail = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: "UNPAID" | "PENDING" | "PAID" | "FAILED" | "NOT_APPLICABLE";
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  location: string | null;
  instructions: string | null;
  totalQuantity: number;
  subtotalNgn: number | null;
  createdAt: string;
  items: OrderItemDetail[];
  whatsappUrl: string | null;
};
```

## B2. `src/hooks/useMounted.ts`

```ts
"use client";

import { useEffect, useState } from "react";

// True only after the component has mounted in the browser.
// The cart lives in localStorage, so we wait for this before showing it (avoids hydration mismatches).
export function useMounted(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted;
}
```

## B3. `src/lib/cart/store.ts`

```ts
import { create } from "zustand";
import { persist } from "zustand/middleware";

// One cart line = one product in one color, with a quantity per size
export type CartItem = {
  key: string; // `${productId}:${color}`
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  color: string;
  sizeBreakdown: Record<string, number>; // { "40": 3, "41": 5 }
  unitPriceNgn: number; // for DISPLAY only — the server recalculates the real price
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "key">) => void;
  setSizeQty: (key: string, size: string, qty: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

// Total pairs in one line / in the whole cart, and the display subtotal
export const itemQuantity = (i: CartItem) =>
  Object.values(i.sizeBreakdown).reduce((a, b) => a + b, 0);
export const cartQuantity = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + itemQuantity(i), 0);
export const cartSubtotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + itemQuantity(i) * i.unitPriceNgn, 0);

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      // Add a line; if the same product + color is already in the cart, merge the size quantities
      addItem: (item) =>
        set((state) => {
          const key = `${item.productId}:${item.color}`;
          const existing = state.items.find((i) => i.key === key);
          if (!existing) return { items: [...state.items, { ...item, key }] };

          const merged = { ...existing.sizeBreakdown };
          for (const [size, qty] of Object.entries(item.sizeBreakdown))
            merged[size] = (merged[size] ?? 0) + qty;
          return {
            items: state.items.map((i) =>
              i.key === key ? { ...i, sizeBreakdown: merged } : i,
            ),
          };
        }),

      // Change one size's quantity (0 removes that size; a line with no sizes left is removed)
      setSizeQty: (key, size, qty) =>
        set((state) => ({
          items: state.items
            .map((i) => {
              if (i.key !== key) return i;
              const next = { ...i.sizeBreakdown };
              if (qty <= 0) delete next[size];
              else next[size] = qty;
              return { ...i, sizeBreakdown: next };
            })
            .filter((i) => itemQuantity(i) > 0),
        })),

      removeItem: (key) =>
        set((state) => ({ items: state.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: "pfc-cart" }, // localStorage key
  ),
);
```

## B4. `src/components/product/ProductConfigurator.tsx`

```tsx
"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductDetail } from "@/lib/api/types";
import { cartQuantity, useCart } from "@/lib/cart/store";
import { formatNgn } from "@/lib/format";

// Color + size-by-size quantity picker with a running total and an Add to cart button
export default function ProductConfigurator({
  product,
}: {
  product: ProductDetail;
}) {
  const addItem = useCart((s) => s.addItem);

  const [color, setColor] = useState(product.colors[0]?.name ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(false);

  // Running total of pairs and price
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const amount = total * product.priceNgn;

  // Set one size's quantity (clamped to 0–1000)
  function setSize(size: number, value: number) {
    const clean = Math.max(0, Math.min(1000, Math.floor(value) || 0));
    setQty((q) => ({ ...q, [String(size)]: clean }));
    setAdded(false);
  }

  // Put the chosen sizes in the cart
  function handleAdd() {
    const sizeBreakdown = Object.fromEntries(
      Object.entries(qty).filter(([, n]) => n > 0),
    );
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.thumbnail,
      color,
      sizeBreakdown,
      unitPriceNgn: product.priceNgn,
    });
    setQty({});
    setAdded(true);
  }

  return (
    <div className="mt-6">
      {/* Color choice */}
      <h2 className="font-medium">Color</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {product.colors.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setColor(c.name)}
            aria-pressed={color === c.name}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              color === c.name
                ? "border-black bg-black text-white"
                : "hover:bg-gray-50"
            }`}
          >
            <span
              className="h-3 w-3 rounded-full border border-gray-300"
              style={{ backgroundColor: c.hex }}
            />
            {c.name}
          </button>
        ))}
      </div>

      {/* Quantity per size */}
      <h2 className="mt-6 font-medium">Sizes and quantity (pairs)</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {product.sizes.map((s) => (
          <label key={s} className="flex flex-col rounded border p-2 text-sm">
            <span className="font-medium">Size {s}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              value={qty[String(s)] ?? 0}
              onChange={(e) => setSize(s, Number(e.target.value))}
              className="mt-1 w-full rounded border px-2 py-1"
              aria-label={`Quantity for size ${s}`}
            />
          </label>
        ))}
      </div>

      {/* Running total */}
      <p className="mt-4 text-sm text-gray-700">
        Total: <strong>{total}</strong> pair{total === 1 ? "" : "s"} ·{" "}
        <strong>{formatNgn(amount)}</strong>
      </p>

      <button
        type="button"
        onClick={handleAdd}
        disabled={total === 0}
        className="mt-4 w-full rounded bg-black px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
      >
        {total === 0 ? "Choose sizes to add to cart" : "Add to cart"}
      </button>

      {/* Confirmation after adding */}
      {added && (
        <p className="mt-3 text-sm text-green-700">
          Added to your cart.{" "}
          <Link href="/cart" className="underline">
            View cart
          </Link>{" "}
          or keep shopping.
        </p>
      )}
    </div>
  );
}
```

> `cartQuantity` is imported but unused above; delete that import if your editor warns.

Now open `src/app/product/[slug]/page.tsx`:

1. Add the import: `import ProductConfigurator from "@/components/product/ProductConfigurator";`
2. **Delete** the "Available colors", "Available sizes" and the disabled "Order options coming next" button blocks.
3. Put this in their place (keep the "custom requests" paragraph if you like):

```tsx
{
  /* Color, sizes, quantity and add to cart */
}
<ProductConfigurator product={p} />;
```

`ProductDetail` already has `thumbnail` from the catalogue API, so no type change is needed.

## B5. `src/components/layout/CartLink.tsx`

```tsx
"use client";

import Link from "next/link";
import { useMounted } from "@/hooks/useMounted";
import { cartQuantity, useCart } from "@/lib/cart/store";

// Header link showing how many pairs are in the cart
export default function CartLink() {
  const mounted = useMounted();
  const count = useCart((s) => cartQuantity(s.items));

  return (
    <Link href="/cart" className="text-sm text-gray-700 hover:text-black">
      Cart{mounted && count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
```

In `src/components/layout/Header.tsx` add `import CartLink from "./CartLink";` and place `<CartLink />` just before `<UserMenu />`.

## B6. `src/app/cart/page.tsx`

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useMounted } from "@/hooks/useMounted";
import {
  cartQuantity,
  cartSubtotal,
  itemQuantity,
  useCart,
} from "@/lib/cart/store";
import { formatNgn } from "@/lib/format";

export default function CartPage() {
  const mounted = useMounted();
  const { items, setSizeQty, removeItem } = useCart();

  // Wait for the browser to load the saved cart
  if (!mounted) return <p className="text-gray-600">Loading your cart...</p>;

  // Empty state
  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Your cart</h1>
        <p className="mt-4 text-gray-600">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-4 inline-block rounded bg-black px-5 py-3 text-white"
        >
          Browse the collection
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">Your cart</h1>

      {/* One card per product + color */}
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div key={item.key} className="flex gap-4 rounded-lg border p-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded bg-gray-100">
              {item.image && (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="flex-1">
              <Link
                href={`/product/${item.slug}`}
                className="font-medium hover:underline"
              >
                {item.name}
              </Link>
              <p className="text-sm text-gray-600">
                {item.color} · {formatNgn(item.unitPriceNgn)} per pair
              </p>

              {/* Editable quantity per size */}
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(item.sizeBreakdown).map(([size, n]) => (
                  <label
                    key={size}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-sm"
                  >
                    Size {size}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={n}
                      onChange={(e) =>
                        setSizeQty(
                          item.key,
                          size,
                          Math.max(0, Math.floor(Number(e.target.value)) || 0),
                        )
                      }
                      className="w-14 rounded border px-1"
                      aria-label={`Quantity for size ${size}`}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between text-sm">
                <span>
                  {itemQuantity(item)} pairs ·{" "}
                  <strong>
                    {formatNgn(itemQuantity(item) * item.unitPriceNgn)}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  className="text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Totals and checkout button */}
      <div className="mt-6 flex flex-col items-end gap-2">
        <p>
          {cartQuantity(items)} pairs · Subtotal{" "}
          <strong>{formatNgn(cartSubtotal(items))}</strong>
        </p>
        <p className="text-xs text-gray-500">
          Delivery fee is confirmed by PFC after you place the order.
        </p>
        <Link
          href="/checkout"
          className="rounded bg-black px-6 py-3 font-medium text-white"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
```

## B7. `src/app/checkout/page.tsx`

```tsx
"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  cartQuantity,
  cartSubtotal,
  itemQuantity,
  useCart,
} from "@/lib/cart/store";
import { formatNgn } from "@/lib/format";
import type { OrderDetail } from "@/lib/api/types";

export default function CheckoutPage() {
  const router = useRouter();
  const mounted = useMounted();
  const { user } = useAuth();
  const { items, clear } = useCart();

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [instructions, setInstructions] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the customer is signed in with Google, prefill name and email (without overwriting what they typed)
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name);
    setEmail((e) => e || user.email);
  }, [user]);

  // Send the order to the API
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CATALOGUE",
          customer: { name, phone, email, location },
          // Only ids, colors and quantities are sent; the server works out prices itself
          items: items.map((i) => ({
            productId: i.productId,
            color: i.color,
            sizeBreakdown: i.sizeBreakdown,
          })),
          instructions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Show the first field-level message if there is one, otherwise the general message
        const detail = data?.error?.details?.[0];
        setError(
          detail
            ? `${detail.issue}`
            : (data?.error?.message ?? "Something went wrong"),
        );
        return;
      }

      // Success: empty the cart and go to the confirmation page (the token lets guests view their order)
      const order = data as OrderDetail & { accessToken: string };
      clear();
      router.push(
        `/order/${order.reference}?token=${encodeURIComponent(order.accessToken)}`,
      );
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return <p className="text-gray-600">Loading...</p>;

  // Nothing to check out
  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Checkout</h1>
        <p className="mt-4 text-gray-600">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-4 inline-block rounded bg-black px-5 py-3 text-white"
        >
          Browse the collection
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Customer details form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <h1 className="text-2xl font-bold">Checkout</h1>

        {/* Optional Google sign-in (full page navigation, so a normal link is used) */}
        {!user && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-700">
            Have a Google account?{" "}
            <a
              href="/api/v1/auth/google/login?next=/checkout"
              className="font-medium underline"
            >
              Continue with Google
            </a>{" "}
            to fill in your details and keep track of your orders. Or just fill
            in the form below.
          </p>
        )}

        <label className="block text-sm font-medium">
          Full name *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Phone number *
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Email (for your confirmation email)
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Delivery location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City / area"
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Additional instructions
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-5 py-3 font-medium text-white disabled:bg-gray-400"
        >
          {submitting ? "Placing order..." : "Place order"}
        </button>
      </form>

      {/* Order summary */}
      <aside className="h-fit rounded-lg border p-4">
        <h2 className="font-semibold">Order summary</h2>
        <div className="mt-3 space-y-3 text-sm">
          {items.map((i) => (
            <div key={i.key} className="border-b pb-3">
              <p className="font-medium">
                {i.name} · {i.color}
              </p>
              <p className="text-gray-600">
                {Object.entries(i.sizeBreakdown)
                  .map(([s, n]) => `Size ${s}: ${n}`)
                  .join(" · ")}
              </p>
              <p>
                {itemQuantity(i)} pairs ·{" "}
                {formatNgn(itemQuantity(i) * i.unitPriceNgn)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex justify-between font-semibold">
          <span>{cartQuantity(items)} pairs</span>
          <span>{formatNgn(cartSubtotal(items))}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Delivery fee is confirmed by PFC after you place the order.
        </p>
        <Link href="/cart" className="mt-3 inline-block text-sm underline">
          Edit cart
        </Link>
      </aside>
    </div>
  );
}
```

## B8. `src/components/order/OrderView.tsx`

```tsx
"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrderDetail } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

// Loads an order by reference (+ token for guests) and shows its details
export default function OrderView() {
  const { reference } = useParams<{ reference: string }>();
  const token = useSearchParams().get("token");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    "loading",
  );

  // Fetch the order through the /api rewrite (the session cookie is sent automatically)
  useEffect(() => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    fetch(`/api/v1/orders/${encodeURIComponent(reference)}${qs}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return setState("missing");
        setOrder(await res.json());
        setState("ready");
      })
      .catch(() => setState("missing"));
  }, [reference, token]);

  if (state === "loading")
    return <p className="text-gray-600">Loading your order...</p>;

  if (state === "missing" || !order) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="mt-2 text-gray-600">
          This link may be incomplete or expired. If you just placed an order,
          sign in with the account you used or contact us.
        </p>
        <Link href="/shop" className="mt-4 inline-block underline">
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">
        Thank you, {order.customerName.split(" ")[0]}!
      </h1>
      <p className="mt-2 text-gray-700">
        Your order <strong>{order.reference}</strong> has been received.
      </p>

      {/* Status */}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-gray-100 px-3 py-1">
          Status: {order.status.replaceAll("_", " ")}
        </span>
        <span className="rounded-full bg-gray-100 px-3 py-1">
          Payment: {order.paymentStatus.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-3 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
        Online payment is coming soon. PFC will contact you to confirm your
        order, the delivery fee and payment.
      </p>

      {/* Items */}
      <div className="mt-6 space-y-3">
        {order.items.map((i) => (
          <div key={i.id} className="rounded-lg border p-4 text-sm">
            <p className="font-medium">
              {i.productName}
              {i.color ? ` · ${i.color}` : ""}
            </p>
            <p className="text-gray-600">
              {Object.entries(i.sizeBreakdown)
                .map(([s, n]) => `Size ${s}: ${n}`)
                .join(" · ")}
            </p>
            <p>
              {i.quantity} pairs
              {i.unitPriceNgn != null
                ? ` · ${formatNgn(i.quantity * i.unitPriceNgn)}`
                : ""}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 flex justify-between font-semibold">
        <span>{order.totalQuantity} pairs</span>
        {order.subtotalNgn != null && (
          <span>{formatNgn(order.subtotalNgn)}</span>
        )}
      </p>

      {/* Customer details */}
      <div className="mt-6 text-sm text-gray-700">
        <p>Phone: {order.customerPhone}</p>
        {order.customerEmail && <p>Email: {order.customerEmail}</p>}
        {order.location && <p>Location: {order.location}</p>}
        {order.instructions && <p>Notes: {order.instructions}</p>}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
        {order.whatsappUrl && (
          <a
            href={order.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-green-600 px-5 py-3 font-medium text-white"
          >
            Send order on WhatsApp
          </a>
        )}
        <Link href="/shop" className="rounded border px-5 py-3 font-medium">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
```

## B9. `src/app/order/[reference]/page.tsx`

```tsx
import { Suspense } from "react";
import OrderView from "@/components/order/OrderView";

export const metadata = { title: "Order confirmation" };

// useSearchParams() needs a Suspense boundary so the production build succeeds
export default function OrderPage() {
  return (
    <Suspense fallback={<p className="text-gray-600">Loading your order...</p>}>
      <OrderView />
    </Suspense>
  );
}
```

## B10. Test locally

Run backend and frontend (`npm run dev` in each), then:

1. Open a product → pick a color → enter quantities for 2–3 sizes → the total updates → **Add to cart**.
2. `/cart` shows it. Change a quantity, remove a size, refresh the page (the cart should survive).
3. **Proceed to checkout** → fill the form → **Place order**.
4. You land on `/order/PFC-…?token=…` with the right items, amount and a green WhatsApp button that opens WhatsApp with the message pre-filled.
5. Open Neon → `Order` and `OrderItem` → the rows exist (`paymentStatus` = `UNPAID`).
6. Try a bad phone number such as `123` → a clear error appears and nothing is saved.
7. Sign in with Google, go to checkout → name and email are prefilled; after ordering, the `userId` column on that `Order` row is set.
8. Open the confirmation URL without `?token=` while signed out → "Order not found".

```bash
cd ..
git add . && git commit -m "feat(frontend): product configurator, cart, checkout and order confirmation"
git push -u origin feat/cart-checkout
git checkout develop && git merge --no-ff feat/cart-checkout && git push
```

---

# Part C — Release to production

1. On **Render** add the env var `PFC_WHATSAPP_NUMBER` (digits only). No other new variables are needed.
2. Merge and push:

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

3. Wait for Render and Vercel to redeploy, then repeat test steps 1–5 on `https://pfc-shop.vercel.app`.

## Done when

- [ ] A product page lets you pick a color and sizes with a running total
- [ ] Cart and checkout work on the live site (also check on your phone)
- [ ] Placing an order creates `Order` + `OrderItem` rows in Neon with server-calculated totals
- [ ] The confirmation page shows the order and the WhatsApp button works
- [ ] Phase 4 boxes ticked in `agent.md` and a Progress Log row added

## Troubleshooting

- **`Cannot find module './x.js'`** — relative imports in the backend must end in `.js`.
- **`401/404` on `/api/v1/orders`** — check `app.use("/api/v1", ordersRouter)` is below `attachUser` and above `notFound`.
- **`INVALID_COLOR`** — the color name must match the product's color exactly (case-sensitive, e.g. `Black`).
- **Hydration warning on the header** — make sure `CartLink` shows the count only after `mounted` is true.
- **`useSearchParams() should be wrapped in a suspense boundary`** — keep `OrderView` inside `<Suspense>` as in B9.
- **429 while testing** — the limit is 20 orders per 15 minutes per IP; wait or restart the backend.
- **First live request is slow** — Render's free instance wakes up after idling (30–60 seconds).

## Next: Phase 5 — Mailgun emails

A confirmation email to the customer and a notification email to PFC, sent after the order is saved (they never block the order). Sign up for Mailgun now if you haven't, and add your second email as an authorized recipient on the sandbox domain, so it's ready.
