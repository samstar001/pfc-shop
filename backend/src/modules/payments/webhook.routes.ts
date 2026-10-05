import express, { Router } from "express";
import { paystackWebhook } from "./controller.js";

// Webhook routes. express.raw keeps the body as bytes, which the signature check needs.
export const webhooksRouter = Router();

webhooksRouter.post(
  "/paystack",
  express.raw({ type: "application/json" }),
  paystackWebhook,
);
