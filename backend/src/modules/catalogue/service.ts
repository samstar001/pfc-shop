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