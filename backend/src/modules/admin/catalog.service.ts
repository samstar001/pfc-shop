import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { prismaCode } from "../../utils/prismaErrors.js";
import { slugify } from "../../utils/slug.js";
import type {
  CreateCategoryBody,
  CreateProductBody,
  ListProductsQuery,
  UpdateCategoryBody,
  UpdateProductBody,
} from "./catalog.schema.js";

// ---------- Products ----------

// Products list for the admin (includes unpublished ones)
export async function listProducts(q: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
    ...(q.category ? { categoryId: q.category } : {}),
    ...(q.published ? { isPublished: q.published === "true" } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return {
    items: rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      thumbnail: p.images[0] ?? null,
      priceNgn: p.priceNgn,
      isPublished: p.isPublished,
      isFeatured: p.isFeatured,
      isNew: p.isNew,
      isPopular: p.isPopular,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}

// One product with all fields (for the edit form)
export async function getProduct(id: string) {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId,
    priceNgn: p.priceNgn,
    colors: p.colors as { name: string; hex: string }[],
    sizes: p.sizes,
    images: p.images,
    isPublished: p.isPublished,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    isPopular: p.isPopular,
    isCustomizable: p.isCustomizable,
  };
}

// Create a product. If the URL name (slug) is taken, an automatic one gets a random suffix.
export async function createProduct(b: CreateProductBody) {
  const base = b.slug ?? (slugify(b.name) || "product");

  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      const p = await prisma.product.create({
        data: {
          name: b.name,
          slug,
          description: b.description,
          categoryId: b.categoryId,
          priceNgn: b.priceNgn,
          colors: b.colors,
          sizes: b.sizes,
          images: b.images,
          isFeatured: b.isFeatured ?? false,
          isNew: b.isNew ?? false,
          isPopular: b.isPopular ?? false,
          isCustomizable: b.isCustomizable ?? true,
          isPublished: b.isPublished ?? true,
        },
      });
      return { id: p.id, slug: p.slug };
    } catch (err) {
      const code = prismaCode(err);
      if (code === "P2002") {
        if (b.slug)
          throw new HttpError(
            409,
            "SLUG_TAKEN",
            "That URL name is already used by another product",
          );
        continue; // automatic slug clashed: try again with a suffix
      }
      if (code === "P2003")
        throw new HttpError(
          422,
          "INVALID_CATEGORY",
          "That category does not exist",
        );
      throw err;
    }
  }
  throw new HttpError(
    409,
    "SLUG_TAKEN",
    "Could not create a unique URL name, please type one in",
  );
}

// Edit a product (only the fields that were sent change)
export async function updateProduct(id: string, patch: UpdateProductBody) {
  try {
    await prisma.product.update({ where: { id }, data: patch });
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Product not found");
    if (code === "P2002")
      throw new HttpError(
        409,
        "SLUG_TAKEN",
        "That URL name is already used by another product",
      );
    if (code === "P2003")
      throw new HttpError(
        422,
        "INVALID_CATEGORY",
        "That category does not exist",
      );
    throw err;
  }
}

// Delete a product. Old orders keep working because their items store a snapshot of the product.
export async function deleteProduct(id: string) {
  try {
    await prisma.product.delete({ where: { id } });
  } catch (err) {
    if (prismaCode(err) === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Product not found");
    throw err;
  }
}

// ---------- Categories ----------

// All categories (including inactive) with how many products each has
export async function listCategories() {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    productCount: c._count.products,
  }));
}

export async function createCategory(b: CreateCategoryBody) {
  const base = b.slug ?? (slugify(b.name) || "category");

  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      const c = await prisma.category.create({
        data: {
          name: b.name,
          slug,
          description: b.description ?? null,
          sortOrder: b.sortOrder ?? 0,
          isActive: b.isActive ?? true,
        },
      });
      return { id: c.id, slug: c.slug };
    } catch (err) {
      if (prismaCode(err) === "P2002") {
        if (b.slug)
          throw new HttpError(
            409,
            "SLUG_TAKEN",
            "That URL name is already used by another category",
          );
        continue;
      }
      throw err;
    }
  }
  throw new HttpError(
    409,
    "SLUG_TAKEN",
    "Could not create a unique URL name, please type one in",
  );
}

export async function updateCategory(id: string, patch: UpdateCategoryBody) {
  try {
    await prisma.category.update({ where: { id }, data: patch });
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Category not found");
    if (code === "P2002")
      throw new HttpError(
        409,
        "SLUG_TAKEN",
        "That URL name is already used by another category",
      );
    throw err;
  }
}

// A category with products cannot be deleted (move or delete its products first, or just hide it)
export async function deleteCategory(id: string) {
  try {
    await prisma.category.delete({ where: { id } });
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Category not found");
    if (code === "P2003") {
      throw new HttpError(
        409,
        "CATEGORY_HAS_PRODUCTS",
        "This category still has products. Hide it instead, or move its products first.",
      );
    }
    throw err;
  }
}
