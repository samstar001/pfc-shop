import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/errorHandler.js";
import { listOrdersQuery, updateStatusBody } from "./orders.schema.js";
import * as service from "./orders.service.js";

// Order ids in URLs must be UUIDs (anything else is a 422, not a database error)
const idParam = z.string().uuid();

// GET /admin/stats
export async function adminStats(_req: Request, res: Response) {
  res.json(await service.getStats());
}

// GET /admin/orders
export async function adminListOrders(req: Request, res: Response) {
  const query = listOrdersQuery.parse(req.query);
  res.json(await service.listOrders(query));
}

// GET /admin/orders/:id
export async function adminGetOrder(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const order = await service.getOrderDetail(id);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found");
  res.json(order);
}

// PATCH /admin/orders/:id/status
export async function adminUpdateOrderStatus(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const { status } = updateStatusBody.parse(req.body);
  const found = await service.updateOrderStatus(id, status);
  if (!found) throw new HttpError(404, "NOT_FOUND", "Order not found");
  res.json({ id, status });
}
