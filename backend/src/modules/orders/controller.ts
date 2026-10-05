import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { signOrderToken, verifyOrderToken } from "../../lib/orderToken.js";
import { buildWhatsappUrl } from "../../services/whatsapp.js";
import { createOrderBody } from "./schema.js";
import * as service from "./service.js";
import { sendOrderEmails } from "../../services/orderEmails.js";
import { canAccessOrder } from "./access.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Shape returned to the frontend for an order
function toOrderDetail(order: OrderWithItems) {
  return {
    id: order.id,
    reference: order.reference,
    type: order.type,
    status: order.status,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    customerEmail: order.customerEmail,
    location: order.location,
    instructions: order.instructions,
    totalQuantity: order.totalQuantity,
    subtotalNgn: order.subtotalNgn,
    createdAt: order.createdAt,
    items: order.items.map((i) => ({
      id: i.id,
      productName: i.productNameSnapshot,
      color: i.color,
      sizeBreakdown: i.sizeBreakdown as Record<string, number>,
      quantity: i.quantity,
      unitPriceNgn: i.unitPriceNgn,
    })),
    whatsappUrl: buildWhatsappUrl(order),
  };
}

// POST /orders — validate, save, return the order, then send emails in the background
export async function createOrder(req: Request, res: Response) {
  const body = createOrderBody.parse(req.body);
  const order = await service.createOrder(body, req.user?.id);
  const accessToken = await signOrderToken(order.id);

  // Respond first; the emails are fire-and-forget and cannot fail the request
  res.status(201).json({ ...toOrderDetail(order), accessToken });
  void sendOrderEmails(order, accessToken);
}

// GET /orders/:reference?token= — allowed with a valid token, or for the owner / an admin
export async function getOrder(req: Request, res: Response) {
  const order = await service.findOrderByReference(
    String(req.params.reference),
  );

  // Same 404 for "missing" and "not yours" so references can't be guessed
  const token = typeof req.query.token === "string" ? req.query.token : null;
  if (!order || !(await canAccessOrder(order, token, req.user))) {
    throw new HttpError(404, "NOT_FOUND", "Order not found");
  }

  res.json(toOrderDetail(order));
}
