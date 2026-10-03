import type { Prisma } from "@prisma/client";
import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { signOrderToken, verifyOrderToken } from "../../lib/orderToken.js";
import { buildWhatsappUrl } from "../../services/whatsapp.js";
import { createOrderBody } from "./schema.js";
import * as service from "./service.js";

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

// POST /orders — validate, save, and return the order with a guest access token
export async function createOrder(req: Request, res: Response) {
  const body = createOrderBody.parse(req.body);
  const order = await service.createOrder(body, req.user?.id);
  const accessToken = await signOrderToken(order.id);
  res.status(201).json({ ...toOrderDetail(order), accessToken });
}

// GET /orders/:reference?token= — allowed with a valid token, or for the owner / an admin
export async function getOrder(req: Request, res: Response) {
  const order = await service.findOrderByReference(
    String(req.params.reference),
  );

  // Same 404 for "missing" and "not yours" so references can't be guessed
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found");

  const token = typeof req.query.token === "string" ? req.query.token : null;
  const tokenOrderId = token ? await verifyOrderToken(token) : null;
  const isOwner = !!req.user && req.user.id === order.userId;
  const isAdmin = req.user?.role === "ADMIN";
  if (tokenOrderId !== order.id && !isOwner && !isAdmin) {
    throw new HttpError(404, "NOT_FOUND", "Order not found");
  }

  res.json(toOrderDetail(order));
}
