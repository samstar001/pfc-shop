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