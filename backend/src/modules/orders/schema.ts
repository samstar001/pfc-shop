export {};
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
