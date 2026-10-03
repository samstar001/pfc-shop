# Phase 5 — Mailgun Confirmation Emails (HNG requirement 3 ⭐)

**Goal:** when an order is placed, the customer gets a confirmation email and PFC gets a "new order" email. Emails are sent **after** the order is saved, and a failed email **never** breaks checkout (agent.md D10).

Put this file at `docs/phase-5-setup.md`. One branch: `feat/mailgun-emails` (from `develop`).

---

## 0. Your two questions, answered first

### "Can Mailgun send to recipients without a paid domain?"

**Yes, for testing, with a limit.** Every Mailgun account comes with a free **sandbox domain** (`sandboxXXXX.mailgun.org`). The rules:

|                 | Sandbox domain (what you have now)                                                    | Your own verified domain (later)                                                                                 |
| --------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Cost            | Free, no card                                                                         | Domain costs money (a `.com` is roughly a few thousand naira a year); Mailgun's Free plan allows 1 custom domain |
| Who can receive | **Only "authorized recipients", max 5**, and each must click an activation link first | Anyone                                                                                                           |
| Good for        | Building, testing, the HNG demo                                                       | Real customers                                                                                                   |

So for now: add `samstarmichael@gmail.com` and your other email as authorized recipients, and test with those. Customers with other addresses won't get emails until PFC has a domain. The code is written so that **the order still succeeds** when Mailgun rejects an address.

### "Should I install Nodemailer?"

**No, not for this.** Nodemailer is only a library for speaking SMTP; it still needs a mail provider behind it, and your HNG task specifically says Mailgun. Mailgun's HTTP API is just one `fetch` call, so we need **no extra package**.

(Nodemailer would only matter if you wanted to send through Gmail SMTP instead. That works for anyone without a domain, but it sends from a personal Gmail account, has daily limits, often lands in spam, and doesn't satisfy the HNG requirement. I'd keep it as a backup idea, not part of this plan.)

---

# Part 1 — Mailgun setup (≈10 min)

> UI labels in dashboards change over time; if a name differs slightly, look for the closest one.

1. Sign up at https://www.mailgun.com with `samstarmichael@gmail.com` (no card needed; you may be asked to verify a phone number).
2. Go to **Sending → Domains**. You will see your sandbox domain, e.g. `sandbox1234abcd.mailgun.org`. Note it, and note its **region** (US or EU).
3. Open the sandbox domain → **Authorized recipients** (also reachable from the domain's overview/API page) → **Add recipient**:
   - `samstarmichael@gmail.com`
   - your second email
4. Mailgun emails each address an invitation. **Open that email and click the activation link.** The status must change from _Unverified_ to _Verified_, otherwise sending is blocked.
5. Create an API key: **Settings → API Security → API keys** (or use the domain's "API" tab). Copy the **private API key**. Treat it like a password.

Add to `backend/.env` (never commit it):

```
MAILGUN_API_KEY=your-private-api-key
MAILGUN_DOMAIN=sandbox1234abcd.mailgun.org
MAILGUN_REGION=us
MAIL_FROM=PFC <postmaster@sandbox1234abcd.mailgun.org>
PFC_NOTIFY_EMAIL=samstarmichael@gmail.com
```

(`MAILGUN_REGION=eu` if your domain shows EU.) Mirror the variable **names** (empty values) into `backend/.env.example`.

---

# Part 2 — Backend

```bash
git checkout develop && git pull
git checkout -b feat/mailgun-emails
cd backend
```

No new packages are needed.

## 2.1 `src/config/env.ts` — add these lines

Add inside the `z.object({ ... })`:

```ts
  // Email (Mailgun). All optional: if they are missing, emails are skipped and orders still work.
  MAILGUN_API_KEY: z.string().default(""),
  MAILGUN_DOMAIN: z.string().default(""),
  MAILGUN_REGION: z.enum(["us", "eu"]).default("us"),
  MAIL_FROM: z.string().default(""),
  PFC_NOTIFY_EMAIL: z.string().default(""),
```

## 2.2 `src/utils/html.ts`

```ts
// Make customer-provided text safe to place inside HTML emails (prevents HTML injection)
export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
```

## 2.3 `src/utils/money.ts`

```ts
// Format whole naira for emails, e.g. 8500 → "₦8,500"
export function formatNgn(amount: number): string {
  return `₦${amount.toLocaleString("en-NG")}`;
}
```

## 2.4 `src/services/mailgun.ts`

```ts
import { env } from "../config/env.js";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; skipped?: boolean; error: string };

// US and EU accounts use different API hosts
const baseUrl =
  env.MAILGUN_REGION === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";

// Emails can only be sent when the key and domain are configured
export function emailConfigured(): boolean {
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
}

// Send one email through Mailgun's HTTP API. Never throws: failures are logged and returned.
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  // Skip quietly when Mailgun is not set up (e.g. a fresh local environment)
  if (!emailConfigured()) {
    console.warn(`[mail] Mailgun not configured, skipping email to ${msg.to}`);
    return { ok: false, skipped: true, error: "Mailgun not configured" };
  }

  const from = env.MAIL_FROM || `PFC <postmaster@${env.MAILGUN_DOMAIN}>`;
  const body = new URLSearchParams({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });

  try {
    // Basic auth with the username "api" and the private API key
    const res = await fetch(`${baseUrl}/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString("base64")}`,
      },
      body,
      signal: AbortSignal.timeout(10_000), // do not hang forever if Mailgun is slow
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    // Mailgun rejected it (wrong key, unauthorized sandbox recipient, ...)
    if (!res.ok) {
      console.error(
        `[mail] Mailgun ${res.status} for ${msg.to}: ${data.message ?? "no message"}`,
      );
      return { ok: false, error: data.message ?? `HTTP ${res.status}` };
    }

    console.log(`[mail] sent "${msg.subject}" to ${msg.to}`);
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(`[mail] failed to send to ${msg.to}`, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
```

## 2.5 `src/emails/layout.ts` (shared pieces)

```ts
import type { Prisma } from "@prisma/client";
import { escapeHtml } from "../utils/html.js";
import { formatNgn } from "../utils/money.js";

export type OrderWithItems = Prisma.OrderGetPayload<{
  include: { items: true };
}>;

// Wrap content in a simple, mobile-friendly email frame
export function emailShell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html>
  <body style="margin:0;background:#f5f5f5;font-family:Arial,Helvetica,sans-serif;color:#111">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
      <tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border-radius:8px">
          <tr><td style="background:#111;color:#fff;padding:16px 24px;font-size:18px;font-weight:bold;border-radius:8px 8px 0 0">PAT Footwear Collection</td></tr>
          <tr><td style="padding:24px">
            <h1 style="margin:0 0 16px;font-size:20px">${escapeHtml(title)}</h1>
            ${bodyHtml}
          </td></tr>
        </table>
        <p style="font-size:12px;color:#888">You received this email because an order was placed at PFC.</p>
      </td></tr>
    </table>
  </body>
</html>`;
}

// Order lines as an HTML table (all customer text is escaped)
export function itemsHtml(order: OrderWithItems): string {
  const rows = order.items
    .map((i) => {
      const sizes = Object.entries(i.sizeBreakdown as Record<string, number>)
        .map(([size, n]) => `Size ${escapeHtml(size)}: ${n}`)
        .join(" · ");
      const price =
        i.unitPriceNgn != null ? formatNgn(i.quantity * i.unitPriceNgn) : "";
      return `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px">
          <strong>${escapeHtml(i.productNameSnapshot)}</strong>${i.color ? ` · ${escapeHtml(i.color)}` : ""}<br>
          <span style="color:#666">${sizes}</span>
        </td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;font-size:14px;text-align:right;white-space:nowrap">${i.quantity} pairs<br>${price}</td>
      </tr>`;
    })
    .join("");
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>`;
}

// Order lines as plain text (for email clients that do not show HTML)
export function itemsText(order: OrderWithItems): string {
  return order.items
    .map((i) => {
      const sizes = Object.entries(i.sizeBreakdown as Record<string, number>)
        .map(([size, n]) => `  Size ${size}: ${n}`)
        .join("\n");
      return `- ${i.productNameSnapshot}${i.color ? ` (${i.color})` : ""}\n${sizes}`;
    })
    .join("\n");
}

// Total line shared by both emails
export function totalLine(order: OrderWithItems): string {
  return order.subtotalNgn != null
    ? `${order.totalQuantity} pairs · ${formatNgn(order.subtotalNgn)}`
    : `${order.totalQuantity} pairs`;
}
```

## 2.6 `src/emails/order-confirmation.ts` (customer email)

```ts
import { escapeHtml } from "../utils/html.js";
import {
  emailShell,
  itemsHtml,
  itemsText,
  totalLine,
  type OrderWithItems,
} from "./layout.js";

// Email sent to the customer after they place an order
export function buildOrderConfirmationEmail(
  order: OrderWithItems,
  orderUrl: string,
  whatsappUrl: string | null,
) {
  const subject = `Your PFC order ${order.reference} has been received`;
  const firstName = order.customerName.split(" ")[0];

  // HTML version
  const html = emailShell(
    `Thank you, ${firstName}!`,
    `
    <p style="font-size:14px;line-height:1.5">We have received your order <strong>${escapeHtml(order.reference)}</strong>.</p>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="font-size:14px;line-height:1.5;background:#fff8e1;padding:12px;border-radius:6px">
      PFC will contact you to confirm availability, the delivery fee and payment.
    </p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your order</a>
      ${
        whatsappUrl
          ? `<a href="${escapeHtml(whatsappUrl)}" style="margin-left:8px;background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Chat on WhatsApp</a>`
          : ""
      }
    </p>`,
  );

  // Plain-text version
  const text = [
    `Thank you, ${firstName}!`,
    `We have received your order ${order.reference}.`,
    "",
    itemsText(order),
    "",
    `Total: ${totalLine(order)}`,
    "PFC will contact you to confirm availability, the delivery fee and payment.",
    "",
    `View your order: ${orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}
```

## 2.7 `src/emails/admin-new-order.ts` (notification to PFC)

```ts
import { escapeHtml } from "../utils/html.js";
import {
  emailShell,
  itemsHtml,
  itemsText,
  totalLine,
  type OrderWithItems,
} from "./layout.js";

// Email sent to PFC when a new order arrives
export function buildAdminNewOrderEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `New order ${order.reference} · ${totalLine(order)}`;

  // Customer details block (customer text is escaped)
  const detailRows: [string, string | null][] = [
    ["Name", order.customerName],
    ["Phone", order.customerPhone],
    ["Email", order.customerEmail],
    ["Location", order.location],
    ["Notes", order.instructions],
  ];
  const details = detailRows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">${k}</td><td style="font-size:14px">${escapeHtml(v!)}</td></tr>`,
    )
    .join("");

  // HTML version
  const html = emailShell(
    `New order ${order.reference}`,
    `
    <table role="presentation" cellspacing="0" cellpadding="0">${details}</table>
    <div style="height:16px"></div>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open order</a></p>`,
  );

  // Plain-text version
  const text = [
    `New order ${order.reference}`,
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    order.customerEmail ? `Email: ${order.customerEmail}` : "",
    order.location ? `Location: ${order.location}` : "",
    order.instructions ? `Notes: ${order.instructions}` : "",
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

## 2.8 `src/services/orderEmails.ts` (decides who gets what)

```ts
import { env } from "../config/env.js";
import { buildAdminNewOrderEmail } from "../emails/admin-new-order.js";
import type { OrderWithItems } from "../emails/layout.js";
import { buildOrderConfirmationEmail } from "../emails/order-confirmation.js";
import { sendEmail } from "./mailgun.js";
import { buildWhatsappUrl } from "./whatsapp.js";

// Send the customer confirmation and the PFC notification for a new order.
// NEVER throws: an email problem must not affect the order.
export async function sendOrderEmails(
  order: OrderWithItems,
  accessToken: string,
): Promise<void> {
  try {
    // Link that opens the order page (the token lets guests view it)
    const base = env.FRONTEND_URL.replace(/\/+$/, "");
    const orderUrl = `${base}/order/${encodeURIComponent(order.reference)}?token=${encodeURIComponent(accessToken)}`;

    const jobs: Promise<unknown>[] = [];

    // 1) Customer confirmation (only if they gave an email)
    if (order.customerEmail) {
      const mail = buildOrderConfirmationEmail(
        order,
        orderUrl,
        buildWhatsappUrl(order),
      );
      jobs.push(sendEmail({ to: order.customerEmail, ...mail }));
    }

    // 2) Notification to PFC (falls back to the first admin email)
    const notify = env.PFC_NOTIFY_EMAIL || env.ADMIN_EMAILS[0];
    if (notify) {
      const mail = buildAdminNewOrderEmail(order, orderUrl);
      jobs.push(sendEmail({ to: notify, ...mail }));
    }

    // Wait for both, regardless of individual failures
    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[mail] sendOrderEmails failed", err);
  }
}
```

## 2.9 `src/modules/orders/controller.ts` — send emails after saving

Add this import with the others:

```ts
import { sendOrderEmails } from "../../services/orderEmails.js";
```

Replace the `createOrder` function with:

```ts
// POST /orders — validate, save, return the order, then send emails in the background
export async function createOrder(req: Request, res: Response) {
  const body = createOrderBody.parse(req.body);
  const order = await service.createOrder(body, req.user?.id);
  const accessToken = await signOrderToken(order.id);

  // Respond first; the emails are fire-and-forget and cannot fail the request
  res.status(201).json({ ...toOrderDetail(order), accessToken });
  void sendOrderEmails(order, accessToken);
}
```

## 2.10 A test script

### `scripts/test-email.ts` (in `backend/`, next to `src/`)

```ts
// Sends one test email so you can check Mailgun before placing a real order.
// Usage: npm run mail:test -- someone@example.com   (defaults to PFC_NOTIFY_EMAIL)
import { env } from "../src/config/env.js";
import { sendEmail } from "../src/services/mailgun.js";

const to = process.argv[2] || env.PFC_NOTIFY_EMAIL;

if (!to) {
  console.error("Pass an email address, or set PFC_NOTIFY_EMAIL");
  process.exit(1);
}

const result = await sendEmail({
  to,
  subject: "PFC Mailgun test",
  text: "If you can read this, Mailgun is working.",
  html: "<p>If you can read this, <strong>Mailgun is working</strong>.</p>",
});

console.log(result);
process.exit(result.ok ? 0 : 1);
```

Add to the `scripts` in `backend/package.json`:

```json
"mail:test": "tsx scripts/test-email.ts"
```

## 2.11 Test the backend

```bash
npm run mail:test
```

- `{ ok: true, id: '<...>' }` → check your inbox **and the spam folder** (sandbox mail often lands there at first; mark it "not spam").
- A `401` → wrong API key (or EU/US region mismatch).
- A `403`/`4xx` mentioning sandbox or recipients → that address isn't a **verified** authorized recipient yet.

Then place a real test order (curl from Phase 4, or through the site) with `"email": "<your authorized email>"` and confirm:

1. The order response comes back immediately.
2. Two emails arrive: the customer confirmation and the "New order" email at `PFC_NOTIFY_EMAIL`.
3. Place another order using an email that is **not** authorized (e.g. `nobody@example.com`). The order must still be created, and your backend terminal shows a `[mail] Mailgun 4xx ...` line. That proves emails never block orders.

```bash
cd ..
git add . && git commit -m "feat(backend): mailgun order confirmation and admin notification emails"
git push -u origin feat/mailgun-emails
git checkout develop && git merge --no-ff feat/mailgun-emails && git push
```

---

# Part 3 — Small frontend touch (optional, 2 minutes)

In `src/components/order/OrderView.tsx`, right after the yellow "Online payment is coming soon" paragraph, add:

```tsx
{
  /* Tell the customer where the confirmation email goes */
}
{
  order.customerEmail && (
    <p className="mt-2 text-sm text-gray-600">
      A confirmation will be emailed to {order.customerEmail}.
    </p>
  );
}
```

(The wording says "will be", because on the sandbox some addresses can't receive mail yet.)

```bash
cd frontend
git add . && git commit -m "feat(frontend): mention confirmation email on order page"
git push
```

---

# Part 4 — Release to production

1. On **Render → Environment**, add the five variables: `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_REGION`, `MAIL_FROM`, `PFC_NOTIFY_EMAIL`. Render will redeploy. (`FRONTEND_URL` must already be your Vercel URL, since the email links are built from it.)
2. Merge and push:

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

3. On `https://pfc-shop.vercel.app` place an order using an authorized email. Within a minute you should receive both emails, and the "View your order" link should open the confirmation page.
4. If nothing arrives, open **Render → Logs** and look for lines starting with `[mail]`.

---

## Done when

- [ ] Your two emails show as **Verified** authorized recipients in Mailgun
- [ ] `npm run mail:test` returns `ok: true` and the message arrives
- [ ] A live order sends a customer confirmation and a PFC notification
- [ ] An order with an unauthorized email still succeeds (error only in logs)
- [ ] Phase 5 ticked in `agent.md` + Progress Log row

## Troubleshooting

- **Nothing arrives, no error** → check spam; confirm the recipient clicked the activation link; confirm Render has all five variables.
- **`[mail] Mailgun not configured`** → `MAILGUN_API_KEY` or `MAILGUN_DOMAIN` is empty in that environment.
- **401** → regenerate/copy the private API key again; check the region.
- **Links in the email go to localhost** → `FRONTEND_URL` on Render is wrong.
- **Emails delayed on the first order after a quiet period** → Render's free instance was asleep; the order still saves.

---

## Later: going live with a real domain (after HNG)

When PFC has a domain, no code changes are needed:

1. Mailgun → **Add new domain** (a subdomain such as `mg.yourdomain.com` is the common choice).
2. Add the DNS records Mailgun shows (SPF/DKIM TXT records, and the others it lists) at your domain registrar; click **Verify** (can take minutes to a couple of days).
3. Change `MAILGUN_DOMAIN` and `MAIL_FROM` on Render (e.g. `PFC <orders@mg.yourdomain.com>`), then redeploy.
4. Any customer email now works, no authorized-recipient list needed.

## Next: Phase 6 (Paystack test payments) or submit first

Since the deadline moved, you have room to do Phase 6 before submitting, but Phases 1–5 already cover all four HNG requirements, so you can also submit the live URL + repo now and keep shipping. In Phase 6, the "PAID" email will be added so customers get a payment receipt as well.
