import type { Request, Response } from "express";
import { listMyOrdersQuery } from "./schema.js";
import * as service from "./service.js";

// GET /account/orders (req.user is guaranteed by requireAuth in routes.ts)
export async function listMyOrders(req: Request, res: Response) {
  const query = listMyOrdersQuery.parse(req.query);
  res.set("Cache-Control", "no-store");
  res.json(await service.listMyOrders(req.user!.id, query));
}

// GET /account/checkout-defaults
export async function checkoutDefaults(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.json(await service.getCheckoutDefaults(req.user!));
}
