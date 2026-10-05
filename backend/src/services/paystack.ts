import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

const BASE = "https://api.paystack.co";

// The parts of a Paystack transaction we use
export type PaystackTx = {
  status: string; // "success" | "failed" | "abandoned" | ...
  reference: string;
  amount: number; // kobo
  currency: string;
  metadata?: unknown;
};

// Paystack may return metadata as an object or as a JSON string; handle both
export function readMetadata(metadata: unknown): {
  orderId?: string;
  orderReference?: string;
} {
  let value = metadata;
  if (typeof value === "string") {
    try {
      value = JSON.parse(value);
    } catch {
      return {};
    }
  }
  if (value && typeof value === "object") {
    const m = value as Record<string, unknown>;
    return {
      orderId: typeof m.orderId === "string" ? m.orderId : undefined,
      orderReference:
        typeof m.orderReference === "string" ? m.orderReference : undefined,
    };
  }
  return {};
}

// Call the Paystack API with the secret key
async function paystackFetch<T>(path: string, init?: RequestInit): Promise<T> {
  if (!env.PAYSTACK_SECRET_KEY) {
    throw new HttpError(
      503,
      "PAYMENTS_UNAVAILABLE",
      "Online payment is not available right now",
    );
  }

  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${env.PAYSTACK_SECRET_KEY}`,
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    console.error("[pay] Paystack request failed", err);
    throw new HttpError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      "Could not reach the payment provider, please try again",
    );
  }

  const json = (await res.json().catch(() => null)) as {
    status?: boolean;
    message?: string;
    data?: T;
  } | null;
  if (!res.ok || !json?.status || !json.data) {
    console.error(
      `[pay] Paystack ${res.status}: ${json?.message ?? "no message"}`,
    );
    throw new HttpError(
      502,
      "PAYMENT_PROVIDER_ERROR",
      "The payment provider rejected the request",
    );
  }
  return json.data;
}

// Create a transaction and get the hosted checkout URL
export async function initializeTransaction(input: {
  email: string;
  amountKobo: number;
  reference: string;
  callbackUrl: string;
  metadata: { orderId: string; orderReference: string };
}): Promise<{ authorizationUrl: string }> {
  const data = await paystackFetch<{ authorization_url: string }>(
    "/transaction/initialize",
    {
      method: "POST",
      body: JSON.stringify({
        email: input.email,
        amount: input.amountKobo,
        currency: "NGN",
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: input.metadata,
      }),
    },
  );
  return { authorizationUrl: data.authorization_url };
}

// Ask Paystack for the truth about a transaction
export async function verifyTransaction(
  reference: string,
): Promise<PaystackTx> {
  return paystackFetch<PaystackTx>(
    `/transaction/verify/${encodeURIComponent(reference)}`,
  );
}

// Check a webhook: HMAC-SHA512 of the RAW body with the secret key must equal the x-paystack-signature header
export function isValidSignature(
  rawBody: Buffer,
  signature: string | undefined,
): boolean {
  if (!env.PAYSTACK_SECRET_KEY || !signature) return false;
  const expected = createHmac("sha512", env.PAYSTACK_SECRET_KEY)
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b); // constant-time comparison
}
