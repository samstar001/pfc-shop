import { z } from "zod";

// One product color, e.g. { name: "Black", hex: "#111111" }
const colorSchema = z.object({
  name: z.string().trim().min(1, "Enter a color name").max(30),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #111111"),
});

// Fields shared by create and edit.
// NOTE: no .default() here on purpose. With PATCH (partial), defaults could silently reset flags.
const productFields = {
  name: z.string().trim().min(2, "Enter a product name").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and dashes",
    )
    .max(140)
    .optional(),
  description: z.string().trim().min(5, "Add a short description").max(2000),
  categoryId: z.string().uuid("Choose a category"),
  priceNgn: z
    .number()
    .int("Price must be a whole number")
    .min(100, "Price is too low")
    .max(10_000_000),
  colors: z.array(colorSchema).min(1, "Add at least one color").max(12),
  sizes: z
    .array(z.number().int().min(20).max(60))
    .min(1, "Add at least one size")
    .max(30),
  images: z
    .array(
      z
        .string()
        .url()
        .refine((u) => u.startsWith("https://"), "Images must be https links"),
    )
    .max(8),
  isFeatured: z.boolean().optional(),
  isNew: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  isCustomizable: z.boolean().optional(),
  isPublished: z.boolean().optional(),
};

export const createProductBody = z.object(productFields);
export const updateProductBody = z.object(productFields).partial(); // every field optional when editing
export type CreateProductBody = z.infer<typeof createProductBody>;
export type UpdateProductBody = z.infer<typeof updateProductBody>;

// GET /admin/products query
export const listProductsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().uuid().optional(),
  published: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

// Categories
const categoryFields = {
  name: z.string().trim().min(2, "Enter a category name").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and dashes",
    )
    .max(80)
    .optional(),
  description: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
};
export const createCategoryBody = z.object(categoryFields);
export const updateCategoryBody = z.object(categoryFields).partial();
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;
