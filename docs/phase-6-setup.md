# Phase 6 — Paystack Test Payments

**Goal:** after placing an order, the customer can click **Pay now**, pay on Paystack's hosted page with a test card, and the order flips to **PAID** in Neon. A receipt email goes to the customer and a "payment received" email to PFC.

Put this file at `docs/phase-6-setup.md`. One branch: `feat/paystack-payments` (from `develop`). Test mode only: no real money moves, and HNG doesn't require real payment.

## How it works

```
Order page ──"Pay now"──► POST /payments/paystack/initialize  { reference, token }
Express: loads the order, amount = subtotal × 100 (kobo), creates a Paystack transaction,
         saves a fresh payment reference, returns { authorizationUrl }
Browser ─► Paystack hosted page (customer pays with a test card)
Paystack ─► redirects browser to  <frontend>/payment/callback/<token>?reference=…
          └► ALSO calls our webhook  POST /webhooks/paystack  (server to server)
Callback page ─► GET /payments/paystack/verify?reference=…&token=…
Express asks Paystack "did this succeed?", checks amount + currency, marks the order PAID once
Callback page ─► redirects to /order/PFC-…?token=…  (shows "Payment received")
```

Why both a callback **and** a webhook: the callback only happens if the customer's browser makes it back. The webhook still arrives if they close the tab. Both call the same `settlePayment()` function, which is **idempotent** (it only marks PAID once and only sends the emails once).

**Rules the code follows**

- The amount always comes from the order in Neon, never from the browser.
- A payment only counts if Paystack says `success`, the currency is `NGN`, and the amount equals `subtotal × 100`.
- The webhook is accepted only if its HMAC-SHA512 signature matches (computed on the **raw** body).
- A fresh payment reference is created per attempt (Paystack rejects reusing a reference), and the order id is stored in the transaction metadata, so even an older attempt that succeeds late is matched to the right order.
- Payment covers the items. The delivery fee is still confirmed by PFC afterwards.

**One change to Phase 4:** Paystack requires an email for every payment, so the checkout email field becomes **required** (steps 2.1 and 3.5).

---

# Part 0 — Paystack setup (≈10 min)

1. Sign up at https://paystack.com (free) and stay in **Test mode** (toggle at the top of the dashboard).
2. **Settings → API Keys & Webhooks**. Copy the **Test Secret Key** (`sk_test_...`).
3. Leave the **Test Webhook URL** empty for now; you'll fill it in after deploying (Part 4).

Add to `backend/.env` (never commit it):

```

```

Add the name (empty value) to `backend/.env.example`.

> Use the **test** key only. A `sk_live_` key would charge real cards.

---

# Part 1 — Branch

```bash
git checkout develop && git pull
git checkout -b feat/paystack-payments
cd backend
```

No new packages are needed (we use Node's built-in `crypto` and `fetch`).

# Part 2 — Backend

## 2.1 `src/modules/orders/schema.ts` — make email required

Replace the `optionalEmail` constant and its use:

```ts
// Email is required: Paystack needs it for the payment and we send the confirmation there
const requiredEmail = z.string().trim().email("Enter a valid email address");
```

and inside `customer`, change `email: optionalEmail,` to:

```ts
    email: requiredEmail,
```

(You can delete the old `optionalEmail` block.)

## 2.2 `src/config/env.ts` — add one line

```ts
  // Paystack secret key (use the TEST key, sk_test_...). Optional: without it, payments are disabled.
  PAYSTACK_SECRET_KEY: z.string().default(""),
```

## 2.3 `src/middleware/rateLimit.ts` — add a payment limiter

Append:

```ts
// Payment start/verify: 40 requests per 15 minutes per IP
export const paymentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({
      error: {
        code: "RATE_LIMITED",
        message: "Too many requests, please try again shortly",
      },
    });
  },
});
```

## 2.4 `src/services/paystack.ts`

```ts
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
```

## 2.5 `src/modules/orders/access.ts` (shared "who may see/pay this order" rule)

```ts
import type { Order, User } from "@prisma/client";
import { verifyOrderToken } from "../../lib/orderToken.js";

// An order can be used by: someone holding its token, the signed-in owner, or an admin
export async function canAccessOrder(
  order: Pick<Order, "id" | "userId">,
  token: string | null | undefined,
  user?: User,
): Promise<boolean> {
  if (token && (await verifyOrderToken(token)) === order.id) return true;
  if (user && (user.id === order.userId || user.role === "ADMIN")) return true;
  return false;
}
```

In `src/modules/orders/controller.ts`, use it in `getOrder`. Add the import:

```ts
import { canAccessOrder } from "./access.js";
```

and replace the token/owner/admin lines in `getOrder` with:

```ts
// Same 404 for "missing" and "not yours" so references can't be guessed
const token = typeof req.query.token === "string" ? req.query.token : null;
if (!order || !(await canAccessOrder(order, token, req.user))) {
  throw new HttpError(404, "NOT_FOUND", "Order not found");
}

res.json(toOrderDetail(order));
```

(Delete the old `if (!order) throw ...` and the `tokenOrderId / isOwner / isAdmin` lines that this replaces. Then remove the now-unused `verifyOrderToken` import from that file if your editor warns.)

## 2.6 `src/emails/payment-received.ts`

```ts
import { escapeHtml } from "../utils/html.js";
import {
  emailShell,
  itemsHtml,
  itemsText,
  totalLine,
  type OrderWithItems,
} from "./layout.js";

// Receipt sent to the customer after a successful payment
export function buildPaymentReceiptEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `Payment received for order ${order.reference}`;
  const firstName = order.customerName.split(" ")[0];

  const html = emailShell(
    `Payment received, thank you ${firstName}!`,
    `
    <p style="font-size:14px;line-height:1.5">We have received your payment for order <strong>${escapeHtml(order.reference)}</strong>.</p>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="font-size:14px;line-height:1.5;background:#ecfdf5;padding:12px;border-radius:6px">
      This payment covers your items. PFC will contact you about delivery and the delivery fee.
    </p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your order</a></p>`,
  );

  const text = [
    `Payment received, thank you ${firstName}!`,
    `We have received your payment for order ${order.reference}.`,
    "",
    itemsText(order),
    "",
    `Total paid: ${totalLine(order)}`,
    "This payment covers your items. PFC will contact you about delivery and the delivery fee.",
    "",
    `View your order: ${orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// Notice sent to PFC when an order has been paid
export function buildAdminPaymentEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `PAID: order ${order.reference} · ${totalLine(order)}`;

  const html = emailShell(
    `Payment received: ${order.reference}`,
    `
    <p style="font-size:14px;line-height:1.5">
      <strong>${escapeHtml(order.customerName)}</strong> paid for this order.<br>
      Phone: ${escapeHtml(order.customerPhone)}${order.location ? `<br>Location: ${escapeHtml(order.location)}` : ""}
    </p>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open order</a></p>`,
  );

  const text = [
    `PAID: order ${order.reference}`,
    `Customer: ${order.customerName} (${order.customerPhone})`,
    order.location ? `Location: ${order.location}` : "",
    "",
    itemsText(order),
    "",
    `Total: ${totalLine(order)}`,
    `Open order: ${orderUrl}`,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
```

## 2.7 `src/services/orderEmails.ts` — add payment emails

Add this import at the top with the others:

```ts
import {
  buildAdminPaymentEmail,
  buildPaymentReceiptEmail,
} from "../emails/payment-received.js";
```

Append this function at the bottom:

```ts
// Send the payment receipt (customer) and the "paid" notice (PFC). NEVER throws.
export async function sendPaymentEmails(
  order: OrderWithItems,
  accessToken: string,
): Promise<void> {
  try {
    const base = env.FRONTEND_URL.replace(/\/+$/, "");
    const orderUrl = `${base}/order/${encodeURIComponent(order.reference)}?token=${encodeURIComponent(accessToken)}`;

    const jobs: Promise<unknown>[] = [];

    if (order.customerEmail) {
      jobs.push(
        sendEmail({
          to: order.customerEmail,
          ...buildPaymentReceiptEmail(order, orderUrl),
        }),
      );
    }

    const notify = env.PFC_NOTIFY_EMAIL || env.ADMIN_EMAILS[0];
    if (notify) {
      jobs.push(
        sendEmail({ to: notify, ...buildAdminPaymentEmail(order, orderUrl) }),
      );
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[mail] sendPaymentEmails failed", err);
  }
}
```

## 2.8 `src/modules/payments/schema.ts`

```ts
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
```

## 2.9 `src/modules/payments/service.ts`

```ts
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import {
  initializeTransaction,
  readMetadata,
  type PaystackTx,
} from "../../services/paystack.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Start a payment attempt for an order and return Paystack's checkout URL
export async function startPayment(
  order: OrderWithItems,
  callbackToken: string,
): Promise<string> {
  // Guard rails: only unpaid catalogue orders with a price and an email can be paid
  if (order.paymentStatus === "PAID")
    throw new HttpError(409, "ALREADY_PAID", "This order is already paid");
  if (order.type !== "CATALOGUE" || !order.subtotalNgn) {
    throw new HttpError(422, "NOT_PAYABLE", "This order cannot be paid online");
  }
  if (!order.customerEmail)
    throw new HttpError(
      422,
      "NO_EMAIL",
      "This order has no email address for payment",
    );

  // A fresh reference for every attempt (Paystack rejects a reused reference)
  const paymentReference = `${order.reference}-${randomBytes(5).toString("hex")}`;
  const base = env.FRONTEND_URL.replace(/\/+$/, "");

  // Amount in kobo comes from the DATABASE, never from the browser
  const { authorizationUrl } = await initializeTransaction({
    email: order.customerEmail,
    amountKobo: order.subtotalNgn * 100,
    reference: paymentReference,
    callbackUrl: `${base}/payment/callback/${callbackToken}`, // Paystack adds ?reference=... itself
    metadata: { orderId: order.id, orderReference: order.reference },
  });

  // Remember the attempt
  await prisma.order.update({
    where: { id: order.id },
    data: { paymentStatus: "PENDING", paymentReference },
  });
  return authorizationUrl;
}

// Apply a Paystack transaction result to its order. Safe to call many times (webhook + callback).
// Returns the fresh order and whether THIS call is the one that marked it paid.
export async function settlePayment(tx: PaystackTx) {
  // Find the order: by the id we stored in metadata, or by the payment reference as a fallback
  const meta = readMetadata(tx.metadata);
  const order = await prisma.order.findFirst({
    where: meta.orderId
      ? { id: meta.orderId }
      : { paymentReference: tx.reference },
    select: { id: true, subtotalNgn: true, paymentStatus: true },
  });
  if (!order) {
    console.warn(`[pay] no order found for transaction ${tx.reference}`);
    return { order: null, newlyPaid: false };
  }

  let newlyPaid = false;

  if (tx.status === "success") {
    // The money must match exactly: right currency and right amount (kobo)
    const expected = (order.subtotalNgn ?? 0) * 100;
    if (expected > 0 && tx.currency === "NGN" && tx.amount === expected) {
      // Atomic "mark paid once": only updates if it is not already PAID
      const result = await prisma.order.updateMany({
        where: { id: order.id, paymentStatus: { not: "PAID" } },
        data: {
          paymentStatus: "PAID",
          paymentReference: tx.reference,
          paidAt: new Date(),
        },
      });
      newlyPaid = result.count === 1;
    } else {
      console.error(
        `[pay] amount/currency mismatch for order ${order.id}: got ${tx.amount} ${tx.currency}, expected ${expected} NGN`,
      );
    }
  } else if (tx.status === "failed" && order.paymentStatus !== "PAID") {
    await prisma.order.update({
      where: { id: order.id },
      data: { paymentStatus: "FAILED" },
    });
  }

  const fresh = await prisma.order.findUniqueOrThrow({
    where: { id: order.id },
    include: { items: true },
  });
  return { order: fresh, newlyPaid };
}
```

## 2.10 `src/modules/payments/controller.ts`

```ts
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
```

## 2.11 Routes

### `src/modules/payments/routes.ts`

```ts
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
```

### `src/modules/payments/webhook.routes.ts`

```ts
import express, { Router } from "express";
import { paystackWebhook } from "./controller.js";

// Webhook routes. express.raw keeps the body as bytes, which the signature check needs.
export const webhooksRouter = Router();

webhooksRouter.post(
  "/paystack",
  express.raw({ type: "application/json" }),
  paystackWebhook,
);
```

## 2.12 `src/app.ts` — register (order matters!)

Add the imports:

```ts
import { paymentsRouter } from "./modules/payments/routes.js";
import { webhooksRouter } from "./modules/payments/webhook.routes.js";
```

Mount the webhook **before** `express.json()` (replace the `NOTE (Phase 6)` comment with this):

```ts
app.use(helmet());

// Paystack webhook: needs the RAW body for signature checking, so it goes BEFORE express.json()
app.use("/api/v1/webhooks", webhooksRouter);

app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
```

and add the payments routes next to the other feature routers (after `attachUser`):

```ts
app.use("/api/v1", paymentsRouter);
```

## 2.13 Test the backend

```bash
npm run dev
```

1. Place an order (through the site, or the Phase 4 curl, now including a valid `"email"`), and copy its `reference` and `accessToken`.
2. Start a payment:

```bash
curl -X POST http://localhost:8000/api/v1/payments/paystack/initialize \
  -H "Content-Type: application/json" \
  -d '{"reference":"PFC-XXXX","token":"PASTE-ACCESS-TOKEN"}'
```

Expected: `{"authorizationUrl":"https://checkout.paystack.com/..."}`. Open it in a browser and pay with the test card (see Part 5).

3. Failure checks: a wrong token → `404`; a bad/missing `PAYSTACK_SECRET_KEY` → `503` or `502`; starting payment on an already-paid order → `409`.
4. Webhook signature check (the request should be rejected):

```bash
curl -i -X POST http://localhost:8000/api/v1/webhooks/paystack \
  -H "Content-Type: application/json" -d '{"event":"charge.success"}'
# → 401 INVALID_SIGNATURE
```

```bash
cd ..
git add . && git commit -m "feat(backend): paystack payments with verified webhook and idempotent settlement"
git push -u origin feat/paystack-payments
```

---

# Part 3 — Frontend

```bash
cd frontend
```

## 3.1 `src/components/order/PayButton.tsx`

```tsx
"use client";

import { useState } from "react";

// Starts a Paystack payment and sends the browser to Paystack's hosted page
export default function PayButton({
  reference,
  token,
  label,
}: {
  reference: string;
  token: string | null;
  label: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pay() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/v1/payments/paystack/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reference, token: token ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error?.message ?? "Could not start payment");
        setLoading(false);
        return;
      }
      // Leave the button in its loading state while the browser navigates away
      window.location.href = data.authorizationUrl;
    } catch {
      setError("Could not reach the server. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={pay}
        disabled={loading}
        className="rounded bg-black px-5 py-3 font-medium text-white disabled:bg-gray-400"
      >
        {loading ? "Redirecting to Paystack..." : label}
      </button>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
```

## 3.2 `src/components/order/OrderView.tsx` — show payment state and the Pay button

Add the imports:

```tsx
import PayButton from "./PayButton";
```

Replace the yellow "Online payment is coming soon" paragraph (and the optional "confirmation will be emailed" line) with:

```tsx
{
  /* Payment state */
}
{
  order.paymentStatus === "PAID" ? (
    <p className="mt-3 rounded bg-green-50 p-3 text-sm text-green-900">
      Payment received. Thank you! PFC will contact you about delivery and the
      delivery fee.
    </p>
  ) : order.type === "CATALOGUE" && order.subtotalNgn != null ? (
    <div className="mt-3 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
      <p>
        {order.paymentStatus === "FAILED"
          ? "Your last payment attempt did not go through. You can try again."
          : "Your order is saved. Pay now to confirm it, or PFC will contact you."}
      </p>
      <p className="mt-1 text-xs">
        Payment covers the items. The delivery fee is confirmed separately by
        PFC.
      </p>
    </div>
  ) : null;
}
```

Then, in the **Actions** area at the bottom, put the pay button first:

```tsx
<div className="mt-8 flex flex-wrap items-start gap-3">
  {/* Pay button only while the order is unpaid */}
  {order.paymentStatus !== "PAID" &&
    order.type === "CATALOGUE" &&
    order.subtotalNgn != null && (
      <PayButton
        reference={order.reference}
        token={token}
        label={`Pay ${formatNgn(order.subtotalNgn)} with Paystack`}
      />
    )}

  {order.whatsappUrl && (
    <a
      href={order.whatsappUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="rounded bg-green-600 px-5 py-3 font-medium text-white"
    >
      Send order on WhatsApp
    </a>
  )}
  <Link href="/shop" className="rounded border px-5 py-3 font-medium">
    Continue shopping
  </Link>
</div>
```

(`token` and `formatNgn` are already in that file from Phase 4.)

## 3.3 `src/components/payment/PaymentCallback.tsx`

```tsx
"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// Landing page after Paystack: asks the API to verify the payment, then opens the order page
export default function PaymentCallback() {
  const { token } = useParams<{ token: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const reference = search.get("reference") ?? search.get("trxref");

  const [error, setError] = useState<string | null>(null);
  const started = useRef(false); // stops React dev mode from verifying twice

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    if (!reference) {
      setError("Missing payment reference.");
      return;
    }

    fetch(
      `/api/v1/payments/paystack/verify?reference=${encodeURIComponent(reference)}&token=${encodeURIComponent(token)}`,
      {
        cache: "no-store",
      },
    )
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok)
          throw new Error(data?.error?.message ?? "Could not verify payment");
        // Show the order page, which displays PAID / FAILED / PENDING
        router.replace(
          `/order/${data.orderReference}?token=${encodeURIComponent(token)}`,
        );
      })
      .catch((e: Error) => setError(e.message));
  }, [reference, token, router]);

  if (error) {
    return (
      <div className="mx-auto max-w-md text-center">
        <h1 className="text-xl font-bold">We could not confirm your payment</h1>
        <p className="mt-2 text-gray-600">{error}</p>
        <p className="mt-2 text-sm text-gray-600">
          If money left your account, do not worry: PFC will confirm it. Contact
          us with your order reference.
        </p>
        <Link href="/" className="mt-4 inline-block underline">
          Back to home
        </Link>
      </div>
    );
  }

  return (
    <p className="text-center text-gray-600">
      Confirming your payment, please wait...
    </p>
  );
}
```

## 3.4 `src/app/payment/callback/[token]/page.tsx`

```tsx
import { Suspense } from "react";
import PaymentCallback from "@/components/payment/PaymentCallback";

export const metadata = { title: "Confirming payment" };

// useSearchParams() needs a Suspense boundary so the production build succeeds
export default function PaymentCallbackPage() {
  return (
    <Suspense
      fallback={
        <p className="text-center text-gray-600">
          Confirming your payment, please wait...
        </p>
      }
    >
      <PaymentCallback />
    </Suspense>
  );
}
```

## 3.5 `src/app/checkout/page.tsx` — email becomes required

Change the email field to:

```tsx
<label className="block text-sm font-medium">
  Email * (for payment and your confirmation)
  <input
    required
    type="email"
    value={email}
    onChange={(e) => setEmail(e.target.value)}
    className="mt-1 w-full rounded border px-3 py-2 font-normal"
  />
</label>
```

```bash
cd ..
git add . && git commit -m "feat(frontend): pay now button, paystack callback page and payment status"
git push
git checkout develop && git merge --no-ff feat/paystack-payments && git push
```

---

# Part 4 — Release and connect the webhook

1. On **Render → Environment** add `PAYSTACK_SECRET_KEY` (the `sk_test_` key). Render redeploys.
2. Release:

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

3. When both deploys are finished, open Paystack (**Test mode**) → **Settings → API Keys & Webhooks** → **Test Webhook URL** and set:

```
https://pfc-shop.onrender.com/api/v1/webhooks/paystack
```

Save. (Use your real Render URL; it must be public, so localhost can't receive webhooks. Locally, the callback page does the verification instead.)

---

# Part 5 — Test it (use these test cards)

Paystack's documented test cards (check the current list on their test-payments page if one fails):

| Result                     | Card                      | Extra                                             |
| -------------------------- | ------------------------- | ------------------------------------------------- |
| ✅ Success, no extra steps | `4084 0840 8408 4081`     | CVV `408`, expiry `09/27` (any valid future date) |
| ✅ Success with PIN + OTP  | `5060 6666 6666 6666 666` | CVV `123`, PIN `1234`, OTP `123456`               |
| ❌ Declined                | `4084 0800 0000 5408`     | CVV `001`                                         |
| ❌ Insufficient funds      | `4084 0800 0067 0037`     | CVV `787`                                         |

On `https://pfc-shop.vercel.app`:

1. Add a product → checkout (with a real email you can read) → **Place order**.
2. On the order page click **Pay ₦… with Paystack** → pay with the success card.
3. You return to the order page showing **Payment received**; Neon shows `paymentStatus = PAID` and a `paidAt` time.
4. Two emails arrive (receipt + "PAID" notice), **only once each**, even though both the callback and the webhook ran.
5. Repeat with the **declined** card: the order stays unpaid and you can click Pay again.
6. In Paystack **Test → Transactions** you see the transactions, and in **Logs** the webhook deliveries with status 200.
7. Refresh the order page after paying: the Pay button is gone.

## Done when

- [ ] "Pay now" opens Paystack with the right amount in ₦
- [ ] A test-card payment returns you to the site and marks the order **PAID** in Neon
- [ ] The Paystack dashboard shows the webhook returning 200
- [ ] Receipt + admin emails arrive once
- [ ] A declined card leaves the order unpaid and retryable
- [ ] Phase 6 ticked in `agent.md` + Progress Log row

## Troubleshooting

- **`PAYMENTS_UNAVAILABLE` (503)** → `PAYSTACK_SECRET_KEY` is empty in that environment.
- **`PAYMENT_PROVIDER_ERROR` (502)** → read the `[pay] Paystack …` line in the logs; usually a wrong key or an invalid email.
- **Returns to the site but says "could not confirm"** → `FRONTEND_URL` on Render must be your Vercel URL; check the callback URL in the Paystack transaction.
- **Webhook shows 401 in Paystack's logs** → the key on Render doesn't match the test key of the same Paystack account, or the webhook route is mounted after `express.json()`.
- **Webhook shows 5xx** → look at Render logs; Paystack retries automatically.
- **Order stays PENDING after paying** → open the callback URL again, or check the Paystack transaction status; the webhook will also fix it when it arrives.
- **Amount mismatch in logs** → the order's `subtotalNgn × 100` differs from what Paystack charged; never edit prices on an order after the payment starts.

## Later (notes for the roadmap)

- **Going live:** swap `PAYSTACK_SECRET_KEY` for the live key once PFC's Paystack business account is activated. No code change.
- **Nodemailer:** `sendEmail()` in `services/mailgun.ts` is the only place that talks to the mail provider, so adding Nodemailer later (for example SMTP from PFC's own domain mailbox) means adding a second sender behind that one function. Sending from a personal Gmail works but has daily limits and lands in spam more, so a domain mailbox or a verified Mailgun domain is the better route.
- **Delivery fee:** can be added as a second payment on the order once PFC confirms it.

## Next: Phase 7 (Accounts / order history) and Phase 8 (Admin dashboard)

Admin comes first in value: PFC needs to see orders and mark them Contacted → Confirmed → In Production → Completed without touching the database.
