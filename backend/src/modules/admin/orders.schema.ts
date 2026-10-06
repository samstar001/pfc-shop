import { z } from "zod";

// Allowed values (must match the enums in schema.prisma)
const ORDER_STATUSES = [
  "NEW",
  "CONTACTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
] as const;
const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "PAID",
  "FAILED",
  "NOT_APPLICABLE",
] as const;

// Query string accepted by GET /admin/orders (everything optional)
export const listOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  type: z.enum(["CATALOGUE", "CUSTOM"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;

// Body of PATCH /admin/orders/:id/status
export const updateStatusBody = z.object({ status: z.enum(ORDER_STATUSES) });
