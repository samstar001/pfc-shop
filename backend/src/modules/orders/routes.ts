import { Router } from "express";
import { orderLimiter } from "../../middleware/rateLimit.js";
import { createOrder, getOrder } from "./controller.js";

// Order routes (guests allowed; attachUser in app.ts links the order to a signed-in user)
export const ordersRouter = Router();

ordersRouter.post("/orders", orderLimiter, createOrder);
ordersRouter.get("/orders/:reference", getOrder);
