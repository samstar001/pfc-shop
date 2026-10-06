import { z } from "zod";

// Query string accepted by GET /account/orders
export const listMyOrdersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
});

export type ListMyOrdersQuery = z.infer<typeof listMyOrdersQuery>;
