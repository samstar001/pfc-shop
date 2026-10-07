import { z } from "zod";
import { env } from "../../config/env.js";

// Phone: remove spaces/dashes, then require 10–15 digits with an optional leading +
const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"));

// Email is required: Paystack needs it for payments and we send confirmations there
const requiredEmail = z.string().trim().email("Enter a valid email address");

// Customer details shared by both kinds of order
const customer = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone,
  email: requiredEmail,
  location: z.string().trim().max(200).optional(),
});

// Catalogue order: products from the shop
const catalogueOrderBody = z.object({
  type: z.literal("CATALOGUE"),
  customer,
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

// Types of footwear a customer can ask for
export const FOOTWEAR_TYPES = [
  "Shoes",
  "Slides",
  "Sandals",
  "Slippers",
  "Other",
] as const;

// A design image must be one we uploaded ourselves (our Cloudinary account)
function isOurImage(url: string): boolean {
  return (
    Boolean(env.CLOUDINARY_CLOUD_NAME) &&
    url.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`)
  );
}

// Custom design request: one design per request, quote only (no price, no payment)
const customOrderBody = z.object({
  type: z.literal("CUSTOM"),
  customer,
  items: z
    .array(
      z.object({
        footwearType: z.enum(FOOTWEAR_TYPES, {
          message: "Choose a type of footwear",
        }),
        designImageUrl: z
          .string()
          .url()
          .refine(isOurImage, "Please upload your design image again")
          .optional(),
        colorNote: z.string().trim().max(200).optional(),
        // e.g. { "40": 3, "41": 5 }; the size range is checked in the service
        sizeBreakdown: z.record(
          z.string().regex(/^\d{2}$/, "Invalid size"),
          z.number().int().min(0).max(1000),
        ),
      }),
    )
    .length(1, "Send one design per request"),
  // The description is the heart of the request, so it is required
  instructions: z
    .string()
    .trim()
    .min(10, "Describe your design in a few words")
    .max(1000),
});

// Body of POST /orders
export const createOrderBody = z.discriminatedUnion("type", [
  catalogueOrderBody,
  customOrderBody,
]);

export type CreateOrderBody = z.infer<typeof createOrderBody>;
export type CatalogueOrderBody = z.infer<typeof catalogueOrderBody>;
export type CustomOrderBody = z.infer<typeof customOrderBody>;
