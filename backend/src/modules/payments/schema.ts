import { z } from "zod";

// Body of POST /payments/paystack/initialize
export const initializeBody = z.object({
  reference: z.string().trim().min(5).max(60), // the order reference, e.g. PFC-20261003-0427
  token: z.string().trim().min(10).optional(), // guest access token (not needed for the signed-in owner)
});

// Query of GET /payments/paystack/verify
export const verifyQuery = z.object({
  reference: z.string().trim().min(5).max(100), // the PAYMENT reference from Paystack
  token: z.string().trim().min(10),
});
