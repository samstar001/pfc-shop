import { Router } from "express";
import { paymentLimiter } from "../../middleware/rateLimit.js";
import { initializePayment, verifyPayment } from "./controller.js";

// Customer-facing payment routes
export const paymentsRouter = Router();

paymentsRouter.post(
  "/payments/paystack/initialize",
  paymentLimiter,
  initializePayment,
);
paymentsRouter.get("/payments/paystack/verify", paymentLimiter, verifyPayment);
