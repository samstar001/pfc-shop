import { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { generateReference } from "../../utils/reference.js";
import type {
  CatalogueOrderBody,
  CreateOrderBody,
  CustomOrderBody,
} from "./schema.js";

type ColorOption = { name: string; hex: string };

// Create an order. Prices and totals come from the database, never from the request.
async function createCatalogueOrder(
  input: CatalogueOrderBody,
  userId?: string,
) {
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

// Create an order of either kind
export async function createOrder(input: CreateOrderBody, userId?: string) {
  return input.type === "CUSTOM"
    ? createCustomOrder(input, userId)
    : createCatalogueOrder(input, userId);
}

// Custom design request: saved as a quote (no price, no payment)
async function createCustomOrder(input: CustomOrderBody, userId?: string) {
  const item = input.items[0];

  // Keep only sizes with a quantity, and make sure each size is a sensible shoe size
  const sizeBreakdown: Record<string, number> = {};
  let quantity = 0;
  for (const [size, qty] of Object.entries(item.sizeBreakdown)) {
    if (qty <= 0) continue;
    const n = Number(size);
    if (n < 20 || n > 50)
      throw new HttpError(422, "INVALID_SIZE", `Size ${size} is not supported`);
    sizeBreakdown[size] = qty;
    quantity += qty;
  }
  if (quantity === 0)
    throw new HttpError(
      422,
      "EMPTY_ITEM",
      "Choose at least one size and quantity",
    );

  // Save the request. Retry if the random reference collides (very rare).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.order.create({
        data: {
          reference: generateReference(),
          userId: userId ?? undefined,
          type: "CUSTOM",
          paymentStatus: "NOT_APPLICABLE",
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          location: input.customer.location || undefined,
          instructions: input.instructions,
          totalQuantity: quantity,
          items: {
            create: [
              {
                productNameSnapshot: `Custom ${item.footwearType.toLowerCase()}`,
                categorySnapshot: "Custom design",
                sizeBreakdown,
                quantity,
                footwearType: item.footwearType,
                designImageUrl: item.designImageUrl,
                colorNote: item.colorNote || undefined,
              },
            ],
          },
        },
        include: { items: true },
      });
    } catch (e) {
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
    "Could not save your request, please try again",
  );
}
