import type { Request, Response } from "express";
import { signOrderToken, verifyOrderToken } from "../../lib/orderToken.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { sendPaymentEmails } from "../../services/orderEmails.js";
import {
  isValidSignature,
  readMetadata,
  verifyTransaction,
} from "../../services/paystack.js";
import { canAccessOrder } from "../orders/access.js";
import { initializeBody, verifyQuery } from "./schema.js";
import { settlePayment, startPayment } from "./service.js";

// POST /payments/paystack/initialize — returns the Paystack checkout URL
export async function initializePayment(req: Request, res: Response) {
  const { reference, token } = initializeBody.parse(req.body);

  const order = await prisma.order.findUnique({
    where: { reference },
    include: { items: true },
  });
  if (!order || !(await canAccessOrder(order, token, req.user))) {
    throw new HttpError(404, "NOT_FOUND", "Order not found");
  }

  // The callback link carries a fresh token so the customer can return to their order (even as a guest)
  const callbackToken = await signOrderToken(order.id);
  const authorizationUrl = await startPayment(order, callbackToken);
  res.json({ authorizationUrl });
}

// GET /payments/paystack/verify — called by the callback page after the customer returns from Paystack
export async function verifyPayment(req: Request, res: Response) {
  const { reference, token } = verifyQuery.parse(req.query);

  // The token proves the caller owns the order this payment is for
  const orderId = await verifyOrderToken(token);
  if (!orderId) throw new HttpError(404, "NOT_FOUND", "Order not found");

  // Ask Paystack, and make sure this transaction really belongs to that order
  const tx = await verifyTransaction(reference);
  if (readMetadata(tx.metadata).orderId !== orderId)
    throw new HttpError(404, "NOT_FOUND", "Order not found");

  const { order, newlyPaid } = await settlePayment(tx);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found");

  // Only the call that actually marked it paid sends the emails
  if (newlyPaid) void sendPaymentEmails(order, token);

  res.json({
    orderReference: order.reference,
    paymentStatus: order.paymentStatus,
  });
}

// POST /webhooks/paystack — called by Paystack servers. req.body is the RAW Buffer here (see app.ts).
export async function paystackWebhook(req: Request, res: Response) {
  const raw = req.body;
  const signature = req.header("x-paystack-signature");

  // Reject anything that is not signed by Paystack
  if (!Buffer.isBuffer(raw) || !isValidSignature(raw, signature)) {
    throw new HttpError(401, "INVALID_SIGNATURE", "Invalid signature");
  }

  let event: { event?: string; data?: unknown };
  try {
    event = JSON.parse(raw.toString("utf8"));
  } catch {
    throw new HttpError(400, "BAD_REQUEST", "Invalid JSON");
  }

  // We only care about successful charges
  if (event.event === "charge.success" && event.data) {
    const { order, newlyPaid } = await settlePayment(
      event.data as Parameters<typeof settlePayment>[0],
    );
    if (order && newlyPaid)
      void sendPaymentEmails(order, await signOrderToken(order.id));
  }

  // Tell Paystack we got it (an error above returns 5xx so Paystack retries)
  res.sendStatus(200);
}
