import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  initializeTransaction,
  readMetadata,
  type PaystackTx,
} from "../../services/paystack.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Start a payment attempt for an order and return Paystack's checkout URL
export async function startPayment(
  order: OrderWithItems,
  callbackToken: string,
): Promise<string> {
  // Guard rails: only unpaid catalogue orders with a price and an email can be paid
  if (order.paymentStatus === "PAID")
    throw new HttpError(409, "ALREADY_PAID", "This order is already paid");
  if (order.type !== "CATALOGUE" || !order.subtotalNgn) {
    throw new HttpError(422, "NOT_PAYABLE", "This order cannot be paid online");
  }
  if (!order.customerEmail)
    throw new HttpError(
      422,
      "NO_EMAIL",
      "This order has no email address for payment",
    );

  // A fresh reference for every attempt (Paystack rejects a reused reference)
  const paymentReference = `${order.reference}-${randomBytes(5).toString("hex")}`;
  const base = env.FRONTEND_URL.replace(/\/+$/, "");

  // Amount in kobo comes from the DATABASE, never from the browser
  const { authorizationUrl } = await initializeTransaction({
    email: order.customerEmail,
    amountKobo: order.subtotalNgn * 100,
    reference: paymentReference,
    callbackUrl: `${base}/payment/callback/${callbackToken}`, // Paystack adds ?reference=... itself
    metadata: { orderId: order.id, orderReference: order.reference },
  });

  // Remember the attempt
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PENDING", paymentReference },
  });
  return authorizationUrl;
}

// Apply a Paystack transaction result to its order. Safe to call many times (webhook + callback).
// Returns the fresh order and whether THIS call is the one that marked it paid.
export async function settlePayment(tx: PaystackTx) {
  // Find the order: by the id we stored in metadata, or by the payment reference as a fallback
  const meta = readMetadata(tx.metadata);
  const order = await prisma.order.findFirst({
    where: meta.orderId
      ? { id: meta.orderId }
      : { paymentReference: tx.reference },
    select: { id: true, subtotalNgn: true, paymentStatus: true },
  });
  if (!order) {
    console.warn(`[pay] no order found for transaction ${tx.reference}`);
    return { order: null, newlyPaid: false };
  }

  let newlyPaid = false;

  if (tx.status === "success") {
    // The money must match exactly: right currency and right amount (kobo)
    const expected = (order.subtotalNgn ?? 0) * 100;
    if (expected > 0 && tx.currency === "NGN" && tx.amount === expected) {
      // Atomic "mark paid once": only updates if it is not already PAID
      const result = await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: { not: "PAID" } },
        data: {
          paymentStatus: "PAID",
          paymentReference: tx.reference,
          paidAt: new Date(),
        },
      });
      newlyPaid = result.count === 1;
    } else {
      console.error(
        `[pay] amount/currency mismatch for order ${order.id}: got ${tx.amount} ${tx.currency}, expected ${expected} NGN`,
      );
    }
  } else if (tx.status === "failed" && order.paymentStatus !== "PAID") {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "FAILED" },
    });
  }

  const fresh = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  return { order: fresh, newlyPaid };
}
