# Phase 9 — Custom Design Requests (`feat/custom-design`)

**Goal:** a customer opens **Custom design**, uploads a photo or sketch, says what they want (type of footwear, colour, sizes and quantities), and sends the request. It is saved in Neon as an order of type `CUSTOM` (no price, no payment), both sides get an email, and PFC sees the design image on the admin order page and replies with a price.

## How it works

```
Customer ──► /custom-design form
              │ 1. picks an image  ─► POST /uploads/design ─► Cloudinary ─► { url }
              │ 2. sends the form  ─► POST /orders  { type: "CUSTOM", items:[{ footwearType, designImageUrl, colorNote, sizeBreakdown }] }
              ▼
        Order(type=CUSTOM, paymentStatus=NOT_APPLICABLE, subtotalNgn=null)
              ├─► email to customer: "We received your request, we'll send a price"
              ├─► email to PFC: details + design image
              └─► /order/[reference]?token=…  (request page, no Pay button)
```

What we reuse: orders table, order token, rate limiting, Cloudinary service, the Phase 5 email frame, the admin order page (it already shows the design image link, footwear type and colour note).

Rules this phase follows:

- **Anyone** can send a request (guests allowed), but uploads are rate-limited and checked by magic bytes, like admin uploads.
- The server only accepts design image URLs that point to **our own Cloudinary account**, so nobody can put a random link in PFC's emails and admin page.
- A request has no price and no payment: `subtotalNgn` stays empty and `paymentStatus` is `NOT_APPLICABLE`. The Phase 6 and Phase 7 code already hides Pay buttons for `CUSTOM` orders.
- No migration: the `Order` and `OrderItem` tables already have everything (Phase 1).
- Emails never block the request, as before.

---

# Part A — Backend

```bash
git checkout develop && git pull
git checkout -b feat/custom-design
cd backend
```

No new packages. Cloudinary must already be set up on Render (Phase 8). If it is not, uploads return `503 UPLOADS_UNAVAILABLE`.

## A1. `src/middleware/rateLimit.ts` — add an upload limiter

Append:

```ts
// Public design uploads: 15 per 15 minutes per IP
export const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  handler: (_req, res) => {
    res
      .status(429)
      .json({
        error: {
          code: "RATE_LIMITED",
          message: "Too many uploads, please try again shortly",
        },
      });
  },
});
```

## A2. The public upload endpoint

```bash
mkdir -p src/modules/uploads
```

### `src/modules/uploads/controller.ts`

```ts
import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { uploadImage } from "../../services/cloudinary.js";
import { detectImageType } from "../../utils/image.js";

// POST /uploads/design (multipart form, field "file") → { url }
export async function uploadDesignImage(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new HttpError(400, "NO_FILE", "Choose an image to upload");

  // Check the real file type from its bytes, not from the file name
  if (!detectImageType(file.buffer)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_TYPE",
      "Only JPEG, PNG or WebP images are allowed",
    );
  }

  try {
    const url = await uploadImage(file.buffer, "designs");
    res.status(201).json({ url });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("[upload] Cloudinary failed", err);
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "Could not upload the image, please try again",
    );
  }
}
```

### `src/modules/uploads/routes.ts`

```ts
import { Router } from "express";
import { imageUpload } from "../../middleware/upload.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import { uploadDesignImage } from "./controller.js";

// Public upload routes (guests can send custom design requests)
export const uploadsRouter = Router();

// The limiter runs first so spammers are stopped before any file is read
uploadsRouter.post(
  "/uploads/design",
  uploadLimiter,
  imageUpload,
  uploadDesignImage,
);
```

### `src/app.ts` — register the router

Add the import with the others:

```ts
import { uploadsRouter } from "./modules/uploads/routes.js";
```

and the line next to the other `app.use("/api/v1", ...)` lines (after `attachUser`, before the error handler):

```ts
app.use("/api/v1", uploadsRouter);
```

## A3. `src/modules/orders/schema.ts` (full file, replaces the old one)

This keeps everything from Phases 4 and 6 (email is required) and adds the custom request. `type` now decides which shape the body must have.

```ts
import { z } from "zod";
import { env } from "../../config/env.js";

// Phone: remove spaces/dashes, then require 10–15 digits with an optional leading +
const phone = z
  .string()
  .transform((v) => v.replace(/[\s-]/g, ""))
  .pipe(z.string().regex(/^\+?[0-9]{10,15}$/, "Enter a valid phone number"));

// Email is required: Paystack needs it for payments and we send confirmations there
const requiredEmail = z.string().trim().email("Enter a valid email address");

// Customer details shared by both kinds of order
const customer = z.object({
  name: z.string().trim().min(2, "Enter your name").max(100),
  phone,
  email: requiredEmail,
  location: z.string().trim().max(200).optional(),
});

// Catalogue order: products from the shop
const catalogueOrderBody = z.object({
  type: z.literal("CATALOGUE"),
  customer,
  items: z
    .array(
      z.object({
        productId: z.string().uuid(),
        color: z.string().trim().min(1).max(50),
        // e.g. { "40": 3, "41": 5 } — sizes are validated against the product in the service
        sizeBreakdown: z.record(z.string(), z.number().int().min(0).max(1000)),
      }),
    )
    .min(1, "Your cart is empty")
    .max(20),
  instructions: z.string().trim().max(1000).optional(),
});

// Types of footwear a customer can ask for
export const FOOTWEAR_TYPES = [
  "Shoes",
  "Slides",
  "Sandals",
  "Slippers",
  "Other",
] as const;

// A design image must be one we uploaded ourselves (our Cloudinary account)
function isOurImage(url: string): boolean {
  return (
    Boolean(env.CLOUDINARY_CLOUD_NAME) &&
    url.startsWith(`https://res.cloudinary.com/${env.CLOUDINARY_CLOUD_NAME}/`)
  );
}

// Custom design request: one design per request, quote only (no price, no payment)
const customOrderBody = z.object({
  type: z.literal("CUSTOM"),
  customer,
  items: z
    .array(
      z.object({
        footwearType: z.enum(FOOTWEAR_TYPES, {
          message: "Choose a type of footwear",
        }),
        designImageUrl: z
          .string()
          .url()
          .refine(isOurImage, "Please upload your design image again")
          .optional(),
        colorNote: z.string().trim().max(200).optional(),
        // e.g. { "40": 3, "41": 5 }; the size range is checked in the service
        sizeBreakdown: z.record(
          z.string().regex(/^\d{2}$/, "Invalid size"),
          z.number().int().min(0).max(1000),
        ),
      }),
    )
    .length(1, "Send one design per request"),
  // The description is the heart of the request, so it is required
  instructions: z
    .string()
    .trim()
    .min(10, "Describe your design in a few words")
    .max(1000),
});

// Body of POST /orders
export const createOrderBody = z.discriminatedUnion("type", [
  catalogueOrderBody,
  customOrderBody,
]);

export type CreateOrderBody = z.infer<typeof createOrderBody>;
export type CatalogueOrderBody = z.infer<typeof catalogueOrderBody>;
export type CustomOrderBody = z.infer<typeof customOrderBody>;
```

## A4. `src/modules/orders/service.ts`

Three edits.

**1.** Change the schema import line to:

```ts
import type {
  CatalogueOrderBody,
  CreateOrderBody,
  CustomOrderBody,
} from "./schema.js";
```

**2.** Find the line

```ts
export async function createOrder(input: CreateOrderBody, userId?: string) {
```

and change it to (no `export`, new name, new type):

```ts
async function createCatalogueOrder(input: CatalogueOrderBody, userId?: string) {
```

Leave the rest of that function as it is.

**3.** Add this at the bottom of the file (or anywhere after the imports):

```ts
// Create an order of either kind
export async function createOrder(input: CreateOrderBody, userId?: string) {
  return input.type === "CUSTOM"
    ? createCustomOrder(input, userId)
    : createCatalogueOrder(input, userId);
}

// Custom design request: saved as a quote (no price, no payment)
async function createCustomOrder(input: CustomOrderBody, userId?: string) {
  const item = input.items[0];

  // Keep only sizes with a quantity, and make sure each size is a sensible shoe size
  const sizeBreakdown: Record<string, number> = {};
  let quantity = 0;
  for (const [size, qty] of Object.entries(item.sizeBreakdown)) {
    if (qty <= 0) continue;
    const n = Number(size);
    if (n < 20 || n > 50)
      throw new HttpError(422, "INVALID_SIZE", `Size ${size} is not supported`);
    sizeBreakdown[size] = qty;
    quantity += qty;
  }
  if (quantity === 0)
    throw new HttpError(
      422,
      "EMPTY_ITEM",
      "Choose at least one size and quantity",
    );

  // Save the request. Retry if the random reference collides (very rare).
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      return await prisma.order.create({
        data: {
          reference: generateReference(),
          userId: userId ?? undefined,
          type: "CUSTOM",
          paymentStatus: "NOT_APPLICABLE",
          customerName: input.customer.name,
          customerPhone: input.customer.phone,
          customerEmail: input.customer.email,
          location: input.customer.location || undefined,
          instructions: input.instructions,
          totalQuantity: quantity,
          items: {
            create: [
              {
                productNameSnapshot: `Custom ${item.footwearType.toLowerCase()}`,
                categorySnapshot: "Custom design",
                sizeBreakdown,
                quantity,
                footwearType: item.footwearType,
                designImageUrl: item.designImageUrl,
                colorNote: item.colorNote || undefined,
              },
            ],
          },
        },
        include: { items: true },
      });
    } catch (e) {
      if (
        e instanceof Prisma.PrismaClientKnownRequestError &&
        e.code === "P2002"
      )
        continue;
      throw e;
    }
  }
  throw new HttpError(
    500,
    "REFERENCE_FAILED",
    "Could not save your request, please try again",
  );
}
```

## A5. `src/modules/orders/controller.ts`

**1.** In `toOrderDetail`, inside the `items: order.items.map((i) => ({ ... }))` object, add three lines after `unitPriceNgn: i.unitPriceNgn,`:

```ts
      footwearType: i.footwearType,
      colorNote: i.colorNote,
      designImageUrl: i.designImageUrl,
```

**2.** Add the import with the others:

```ts
import {
  sendOrderEmails,
  sendQuoteEmails,
} from "../../services/orderEmails.js";
```

(replace the existing `sendOrderEmails` import line).

**3.** In `createOrder`, replace the last line `void sendOrderEmails(order, accessToken);` with:

```ts
// Custom requests get quote emails; catalogue orders get the normal confirmation
void (order.type === "CUSTOM"
  ? sendQuoteEmails(order, accessToken)
  : sendOrderEmails(order, accessToken));
```

## A6. `src/services/whatsapp.ts` — mention custom requests

**1.** Change the first line of `buildWhatsappMessage`:

```ts
const lines: string[] = [
  order.type === "CUSTOM"
    ? `Hello PFC, I sent a custom design request ${order.reference}.`
    : `Hello PFC, I placed order ${order.reference}.`,
];
```

**2.** Inside the `for (const item of order.items)` loop, after the `for (const [size, qty] ...)` sizes loop, add:

```ts
if (item.colorNote) lines.push(`Colour: ${item.colorNote}`);
if (item.designImageUrl) lines.push(`Design: ${item.designImageUrl}`);
```

## A7. Emails

### `src/emails/layout.ts` — add at the bottom

```ts
// Design details of a custom request (image, type and colour note), as HTML
export function designHtml(order: OrderWithItems): string {
  return order.items
    .filter((i) => i.designImageUrl || i.colorNote || i.footwearType)
    .map(
      (i) => `<div style="margin:12px 0;font-size:14px">
        ${i.footwearType ? `<p style="margin:0 0 4px"><strong>Type:</strong> ${escapeHtml(i.footwearType)}</p>` : ""}
        ${i.colorNote ? `<p style="margin:0 0 8px"><strong>Colour:</strong> ${escapeHtml(i.colorNote)}</p>` : ""}
        ${
          i.designImageUrl
            ? `<a href="${escapeHtml(i.designImageUrl)}"><img src="${escapeHtml(i.designImageUrl)}" alt="Design image" width="240" style="max-width:100%;border-radius:6px;border:1px solid #eee"></a>`
            : ""
        }
      </div>`,
    )
    .join("");
}

// Design details as plain text
export function designText(order: OrderWithItems): string {
  return order.items
    .map((i) =>
      [
        i.footwearType ? `Type: ${i.footwearType}` : "",
        i.colorNote ? `Colour: ${i.colorNote}` : "",
        i.designImageUrl ? `Design image: ${i.designImageUrl}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    )
    .filter(Boolean)
    .join("\n");
}
```

### `src/emails/quote-received.ts` (customer email)

```ts
import { escapeHtml } from "../utils/html.js";
import {
  designHtml,
  designText,
  emailShell,
  itemsHtml,
  itemsText,
  type OrderWithItems,
} from "./layout.js";

// Email sent to the customer after they send a custom design request
export function buildQuoteReceivedEmail(
  order: OrderWithItems,
  orderUrl: string,
  whatsappUrl: string | null,
) {
  const subject = `We received your custom design request ${order.reference}`;
  const firstName = order.customerName.split(" ")[0];

  // HTML version
  const html = emailShell(
    `Thank you, ${firstName}!`,
    `
    <p style="font-size:14px;line-height:1.5">We received your custom design request <strong>${escapeHtml(order.reference)}</strong>.</p>
    ${designHtml(order)}
    ${itemsHtml(order)}
    ${order.instructions ? `<p style="font-size:14px;line-height:1.5"><strong>Your description:</strong><br>${escapeHtml(order.instructions)}</p>` : ""}
    <p style="font-size:14px;line-height:1.5;background:#f1e9e2;padding:12px;border-radius:6px">
      PFC will review your design and contact you with a price. You do not need to pay anything now.
    </p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(orderUrl)}" style="background:#6d4e37;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your request</a>
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
    `We received your custom design request ${order.reference}.`,
    "",
    designText(order),
    itemsText(order),
    order.instructions ? `\nYour description: ${order.instructions}` : "",
    "",
    "PFC will review your design and contact you with a price. You do not need to pay anything now.",
    "",
    `View your request: ${orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}
```

### `src/emails/admin-new-quote.ts` (notification to PFC)

```ts
import { escapeHtml } from "../utils/html.js";
import {
  designHtml,
  designText,
  emailShell,
  itemsHtml,
  itemsText,
  type OrderWithItems,
} from "./layout.js";

// Email sent to PFC when a custom design request arrives
export function buildAdminNewQuoteEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `Custom design request ${order.reference} · ${order.totalQuantity} pairs`;

  // Customer details block (customer text is escaped)
  const detailRows: [string, string | null][] = [
    ["Name", order.customerName],
    ["Phone", order.customerPhone],
    ["Email", order.customerEmail],
    ["Location", order.location],
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
    `Custom design request ${order.reference}`,
    `
    <table role="presentation" cellspacing="0" cellpadding="0">${details}</table>
    ${designHtml(order)}
    ${itemsHtml(order)}
    ${order.instructions ? `<p style="font-size:14px;line-height:1.5"><strong>Description:</strong><br>${escapeHtml(order.instructions)}</p>` : ""}
    <p style="font-size:14px;color:#666">This is a quote request. Reply to the customer with a price.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#6d4e37;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open request</a></p>`,
  );

  // Plain-text version
  const text = [
    `Custom design request ${order.reference}`,
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    order.customerEmail ? `Email: ${order.customerEmail}` : "",
    order.location ? `Location: ${order.location}` : "",
    "",
    designText(order),
    itemsText(order),
    order.instructions ? `\nDescription: ${order.instructions}` : "",
    "",
    "This is a quote request. Reply to the customer with a price.",
    `Open request: ${orderUrl}`,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
```

### `src/services/orderEmails.ts` — add the quote sender

Add the imports at the top:

```ts
import { buildAdminNewQuoteEmail } from "../emails/admin-new-quote.js";
import { buildQuoteReceivedEmail } from "../emails/quote-received.js";
```

and add this function at the bottom:

```ts
// Send the "request received" email (customer) and the "new request" notice (PFC). NEVER throws.
export async function sendQuoteEmails(
  order: OrderWithItems,
  accessToken: string,
): Promise<void> {
  try {
    // Link that opens the request page (the token lets guests view it)
    const base = env.FRONTEND_URL.replace(/\/+$/, "");
    const orderUrl = `${base}/order/${encodeURIComponent(order.reference)}?token=${encodeURIComponent(accessToken)}`;

    const jobs: Promise<unknown>[] = [];

    // 1) Customer
    if (order.customerEmail) {
      const mail = buildQuoteReceivedEmail(
        order,
        orderUrl,
        buildWhatsappUrl(order),
      );
      jobs.push(sendEmail({ to: order.customerEmail, ...mail }));
    }

    // 2) PFC (falls back to the first admin email)
    const notify = env.PFC_NOTIFY_EMAIL || env.ADMIN_EMAILS[0];
    if (notify) {
      jobs.push(
        sendEmail({ to: notify, ...buildAdminNewQuoteEmail(order, orderUrl) }),
      );
    }

    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[mail] sendQuoteEmails failed", err);
  }
}
```

## A8. Test the backend

```bash
npm run build   # catches type errors
npm run dev
```

**Upload** (use any small JPEG or PNG):

```bash
curl -F "file=@/path/to/photo.jpg" http://localhost:8000/api/v1/uploads/design
```

Expected: `201` with `{ "url": "https://res.cloudinary.com/<your-cloud>/..." }`. Other files: a `.txt` renamed to `.jpg` gives `415`; no file gives `400`.

**Custom request** (paste the URL you got above, or leave `designImageUrl` out):

```bash
curl -X POST http://localhost:8000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "type": "CUSTOM",
    "customer": { "name": "Test User", "phone": "08012345678", "email": "you@example.com", "location": "Minna" },
    "items": [ { "footwearType": "Slides", "designImageUrl": "PASTE-URL", "colorNote": "Black with gold straps", "sizeBreakdown": { "40": 2, "41": 3 } } ],
    "instructions": "Wide strap slides with a gold buckle."
  }'
```

Expected: `201`, `type: "CUSTOM"`, `paymentStatus: "NOT_APPLICABLE"`, `subtotalNgn: null`, `totalQuantity: 5`, an `accessToken`. Two emails go out (use your authorized Mailgun address as the customer email while on the sandbox). Failure cases:

```bash
# image URL from another site  → 422 "Please upload your design image again"
# "instructions": "short"      → 422 "Describe your design in a few words"
# sizeBreakdown {"40":0}       → 422 EMPTY_ITEM
# sizeBreakdown {"99":1}       → 422 INVALID_SIZE
# an old catalogue order       → still works exactly as before
```

```bash
cd ..
git add . && git commit -m "feat(backend): custom design requests with public image upload and quote emails"
git push -u origin feat/custom-design
```

---

# Part B — Frontend

```bash
cd frontend
```

## B1. `src/lib/api/types.ts` — extend the order item

In `OrderItemDetail`, add three fields after `unitPriceNgn`:

```ts
  footwearType?: string | null;
  colorNote?: string | null;
  designImageUrl?: string | null;
```

## B2. `src/components/custom/DesignUploader.tsx`

```bash
mkdir -p src/components/custom
```

```tsx
"use client";

import { useEffect, useRef, useState } from "react";

const TYPES = ["image/jpeg", "image/png", "image/webp"];

// Pick a design image: it uploads straight away and gives the parent the hosted URL
export default function DesignUploader({
  onChange,
  onBusy,
}: {
  onChange: (url: string | null) => void;
  onBusy: (busy: boolean) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Tell the form while an upload is running (so it can disable the send button)
  useEffect(() => onBusy(uploading), [uploading, onBusy]);

  // Free the temporary preview when it changes or the component goes away
  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  // Check the file, show a preview, then upload it
  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError(null);
    onChange(null);

    if (!TYPES.includes(file.type))
      return setError("Choose a JPEG, PNG or WebP image.");
    if (file.size > 5 * 1024 * 1024)
      return setError("The image must be 5 MB or smaller.");

    setPreview(URL.createObjectURL(file));
    setUploading(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const res = await fetch("/api/v1/uploads/design", {
        method: "POST",
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message ?? "Upload failed");
      onChange(data.url as string);
    } catch (e) {
      setPreview(null);
      setError(
        e instanceof Error ? e.message : "Upload failed. Please try again.",
      );
    } finally {
      setUploading(false);
    }
  }

  // Remove the chosen image
  function remove() {
    setPreview(null);
    setError(null);
    onChange(null);
    if (input.current) input.current.value = "";
  }

  return (
    <div>
      {preview ? (
        <div className="flex items-start gap-4">
          {/* Preview of the chosen image */}
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={preview}
            alt="Your design"
            className="h-40 w-40 rounded-lg border border-line object-cover"
          />
          <div className="text-sm">
            <p className="text-muted">
              {uploading ? "Uploading..." : "Image uploaded."}
            </p>
            <button
              type="button"
              onClick={remove}
              disabled={uploading}
              className="mt-2 font-medium text-brand underline disabled:opacity-50"
            >
              Remove image
            </button>
          </div>
        </div>
      ) : (
        <label className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-line bg-white px-4 py-8 text-center text-sm focus-within:outline focus-within:outline-2 focus-within:outline-brand hover:bg-page">
          <span className="font-medium">Choose a photo or sketch</span>
          <span className="mt-1 text-muted">JPEG, PNG or WebP, up to 5 MB</span>
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => handleFile(e.target.files?.[0])}
            className="sr-only"
          />
        </label>
      )}
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      )}
    </div>
  );
}
```

## B3. `src/components/custom/CustomDesignForm.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import type { OrderDetail } from "@/lib/api/types";
import DesignUploader from "./DesignUploader";

// Choices for the type of footwear (must match the backend list)
const FOOTWEAR_TYPES = ["Shoes", "Slides", "Sandals", "Slippers", "Other"];

// Sizes shown in the quantity grid
const SIZES = Array.from({ length: 12 }, (_, i) => 36 + i);

export default function CustomDesignForm() {
  const router = useRouter();
  const { user } = useAuth();

  // Request details
  const [footwearType, setFootwearType] = useState("");
  const [designUrl, setDesignUrl] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [colorNote, setColorNote] = useState("");
  const [quantities, setQuantities] = useState<Record<number, number>>({});
  const [instructions, setInstructions] = useState("");

  // Contact details
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Signed-in customers: fill in name and email, and phone and location from their last order
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name);
    setEmail((e) => e || user.email);
    fetch("/api/v1/account/checkout-defaults", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => {
        if (!d) return;
        setPhone((p) => p || d.phone || "");
        setLocation((l) => l || d.location || "");
      })
      .catch(() => {
        /* prefill is a convenience: ignore errors */
      });
  }, [user]);

  // Total pairs across all sizes
  const total = Object.values(quantities).reduce((sum, n) => sum + n, 0);

  // Set the quantity for one size (0 to 1000)
  function setQuantity(size: number, value: string) {
    const n = Math.max(0, Math.min(1000, Math.floor(Number(value) || 0)));
    setQuantities((q) => ({ ...q, [size]: n }));
  }

  // Send the request to the API
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!footwearType) return setError("Choose a type of footwear.");
    if (total === 0)
      return setError("Enter how many pairs you want in at least one size.");

    // Only sizes with a quantity are sent
    const sizeBreakdown: Record<string, number> = {};
    for (const [size, n] of Object.entries(quantities))
      if (n > 0) sizeBreakdown[size] = n;

    setSubmitting(true);
    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CUSTOM",
          customer: { name, phone, email, location },
          items: [
            {
              footwearType,
              designImageUrl: designUrl ?? undefined,
              colorNote: colorNote || undefined,
              sizeBreakdown,
            },
          ],
          instructions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        const detail = data?.error?.details?.[0];
        setError(
          detail
            ? detail.issue
            : (data?.error?.message ?? "Something went wrong"),
        );
        return;
      }

      // Success: open the request page (the token lets guests view it)
      const order = data as OrderDetail & { accessToken: string };
      router.push(
        `/order/${order.reference}?token=${encodeURIComponent(order.accessToken)}`,
      );
    } catch {
      setError(
        "Could not reach the server. Please check your connection and try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Optional Google sign-in */}
      {!user && (
        <p className="panel p-3 text-sm text-muted">
          Have a Google account?{" "}
          <a
            href="/api/v1/auth/google/login?next=/custom-design"
            className="font-medium text-brand underline"
          >
            Continue with Google
          </a>{" "}
          to fill in your details and keep track of your requests. Or just fill
          in the form below.
        </p>
      )}

      {/* Type of footwear */}
      <fieldset>
        <legend className="text-sm font-medium">
          What do you want made? *
        </legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FOOTWEAR_TYPES.map((t) => (
            <label key={t} className="relative">
              <input
                type="radio"
                name="footwearType"
                value={t}
                checked={footwearType === t}
                onChange={() => setFootwearType(t)}
                className="peer sr-only"
              />
              <span className="inline-block cursor-pointer rounded-lg border border-line bg-white px-4 py-2 text-sm font-medium peer-checked:border-brand peer-checked:bg-brand peer-checked:text-white peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand">
                {t}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      {/* Design image */}
      <div>
        <p className="text-sm font-medium">Your design</p>
        <p className="mb-2 text-sm text-muted">
          A photo, sketch or screenshot of what you have in mind. Optional, but
          it helps us price it.
        </p>
        <DesignUploader onChange={setDesignUrl} onBusy={setUploadBusy} />
      </div>

      {/* Description and colour */}
      <div className="space-y-4">
        <label className="block text-sm font-medium">
          Describe your design *
          <textarea
            required
            minLength={10}
            rows={4}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="Material, strap style, sole, logo, anything we should know"
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Colours
          <input
            value={colorNote}
            onChange={(e) => setColorNote(e.target.value)}
            placeholder="e.g. Black with gold straps"
            maxLength={200}
            className="mt-1 w-full font-normal"
          />
        </label>
      </div>

      {/* Sizes and quantities */}
      <fieldset>
        <legend className="text-sm font-medium">
          How many pairs in each size? *
        </legend>
        <div className="mt-2 grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-6">
          {SIZES.map((s) => (
            <label key={s} className="text-sm">
              <span className="block text-muted">Size {s}</span>
              <input
                type="number"
                inputMode="numeric"
                min={0}
                max={1000}
                value={quantities[s] ? quantities[s] : ""}
                placeholder="0"
                onChange={(e) => setQuantity(s, e.target.value)}
                className="mt-1 w-full"
              />
            </label>
          ))}
        </div>
        <p className="mt-2 text-sm font-medium">
          Total: {total} pair{total === 1 ? "" : "s"}
        </p>
      </fieldset>

      {/* Contact details */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">How can we reach you?</h2>
        <label className="block text-sm font-medium">
          Full name *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Phone number *
          <input
            required
            type="tel"
            inputMode="tel"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Email *
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full font-normal"
          />
        </label>
        <label className="block text-sm font-medium">
          Location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City / area"
            className="mt-1 w-full font-normal"
          />
        </label>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      <div>
        <button
          type="submit"
          disabled={submitting || uploadBusy}
          className="btn-primary w-full sm:w-auto"
        >
          {submitting
            ? "Sending..."
            : uploadBusy
              ? "Uploading image..."
              : "Send request"}
        </button>
        <p className="mt-2 text-sm text-muted">
          This is a quote request. You do not pay anything now.
        </p>
      </div>
    </form>
  );
}
```

## B4. `src/app/custom-design/page.tsx` (full file, replaces the placeholder)

```tsx
import CustomDesignForm from "@/components/custom/CustomDesignForm";

export const metadata = { title: "Custom design" };

export default function CustomDesignPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-3xl font-bold">Request a custom design</h1>
      <p className="mt-3 text-muted">
        Tell us what you want made. Upload a photo or sketch, describe it, and
        choose your sizes. PFC will review your request and contact you with a
        price. You do not pay anything until you agree to it.
      </p>

      <div className="mt-8">
        <CustomDesignForm />
      </div>
    </div>
  );
}
```

## B5. `src/components/order/OrderView.tsx` — show requests properly

Small edits to the file as it is now:

**1.** Add the import at the top:

```tsx
import Image from "next/image";
```

**2.** Replace the paragraph that says `Your order <strong>{order.reference}</strong> has been received.` with:

```tsx
<p className="mt-2 text-gray-700">
  Your {order.type === "CUSTOM" ? "custom design request" : "order"}{" "}
  <strong>{order.reference}</strong> has been received.
</p>
```

**3.** In the status pills, hide the payment pill for requests. Change the line that shows `Payment: ...` to:

```tsx
{
  order.paymentStatus !== "NOT_APPLICABLE" && (
    <span className="rounded-full bg-gray-100 px-3 py-1">
      Payment: {order.paymentStatus.replaceAll("_", " ")}
    </span>
  );
}
```

**4.** In the payment-state block, the ternary currently ends with `) : null}`. Replace that ending with a branch for requests:

```tsx
      ) : order.type === "CUSTOM" ? (
        <p className="mt-3 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
          PFC will review your design and contact you with a price. You do not need to pay anything now.
        </p>
      ) : null}
```

**5.** In the items list, inside each item card, add this after the paragraph that shows the sizes:

```tsx
{
  i.colorNote && <p className="text-gray-600">Colour: {i.colorNote}</p>;
}
{
  i.designImageUrl && (
    <Image
      src={i.designImageUrl}
      alt="Your design"
      width={240}
      height={240}
      className="my-2 h-48 w-auto rounded-lg border object-contain"
    />
  );
}
```

**6.** The "Continue shopping" link at the bottom can stay. The WhatsApp button already works: the message now says "custom design request".

## B6. `src/app/admin/orders/[id]/page.tsx` — show the design image

Add `import Image from "next/image";` at the top, then replace the "View design image" link:

```tsx
{
  i.designImageUrl && (
    <a
      href={i.designImageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="underline"
    >
      View design image
    </a>
  );
}
```

with:

```tsx
{
  i.designImageUrl && (
    <a
      href={i.designImageUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="my-2 block w-fit"
    >
      <Image
        src={i.designImageUrl}
        alt="Customer design"
        width={320}
        height={320}
        className="h-64 w-auto rounded-lg border object-contain"
      />
      <span className="text-xs underline">Open full size</span>
    </a>
  );
}
```

## B7. Test locally

```bash
npm run dev
```

1. Open `/custom-design`. The page looks like the rest of the site (brown buttons, white fields).
2. Choose a type, pick an image: a preview shows and "Image uploaded." appears. **Remove image** clears it. A PDF or a file over 5 MB shows a clear message.
3. Leave the description empty or under 10 characters: the browser blocks it, and the server also rejects it.
4. Enter no quantities and press Send: "Enter how many pairs you want in at least one size."
5. Fill everything in and press **Send request**: you land on `/order/PFC-...?token=...`. It says "custom design request", shows the type, colour, your image and sizes, **no Pay button** and no "Payment" pill.
6. Check email: the customer email (sent to your authorized Mailgun address while on the sandbox) shows the design image; the admin email goes to `PFC_NOTIFY_EMAIL` or your first admin email.
7. Neon: the new `Order` row has `type = CUSTOM`, `paymentStatus = NOT_APPLICABLE`, `subtotalNgn` empty; the `OrderItem` has `footwearType`, `designImageUrl` and `colorNote`.
8. Admin → Orders: the request appears with the **Custom design** badge and "Quote needed" as the total; open it to see the image, and use the WhatsApp, Call and Email buttons to reply with a price. Change its status to **Contacted**, then **Confirmed** when the customer agrees.
9. Signed in: **My orders** lists the request with its status and no Pay button.
10. A normal catalogue order still works from start to payment.

```bash
npm run build   # must pass before you push
cd ..
git add . && git commit -m "feat(frontend): custom design request form, design upload and request page"
git push -u origin feat/custom-design
git checkout develop && git merge --no-ff feat/custom-design && git push
```

---

# Part C — Release

No new environment variables, packages or migrations (Cloudinary and Mailgun are already configured on Render):

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

Wait for Render and Vercel to redeploy, then repeat test steps 2, 5 and 8 on `https://pfc-shop.vercel.app`. The first request after Render has been idle can take up to a minute.

## Done when

- [ ] `/custom-design` lets a guest or signed-in customer upload an image and send a request
- [ ] The request is saved as `CUSTOM` with no price and `NOT_APPLICABLE` payment
- [ ] Customer and PFC both get an email with the design details
- [ ] The request page shows the design and has no Pay button
- [ ] The admin order page shows the design image and contact buttons
- [ ] Image URLs from other sites and files that are not images are rejected
- [ ] Phase 9 ticked in `agent.md` + Progress Log row

## Troubleshooting

- **Upload says "Image uploads are not set up yet" (503)** → set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` on Render (Phase 8) and redeploy.
- **"Please upload your design image again" on submit** → the image URL must start with `https://res.cloudinary.com/<CLOUDINARY_CLOUD_NAME>/`. If your local `.env` and Render use different Cloudinary accounts, an image uploaded in one will be refused by the other.
- **The design image does not show on the order page** → `res.cloudinary.com` must be listed in `next.config.ts` `images.remotePatterns` (added in Phase 8).
- **Emails do not arrive** → on the Mailgun sandbox the customer email must be an authorized recipient; check the backend logs for `[mail]` lines.
- **`npm run build` error about `CreateOrderBody`** → the old `createOrder` in `service.ts` must be renamed to `createCatalogueOrder` with type `CatalogueOrderBody` (step A4.2).
- **Type error on `item.footwearType` in `whatsapp.ts` or the emails** → make sure `toOrderDetail` and the Prisma include are unchanged: these files read the Prisma `OrderItem`, which already has the field.

## Later ideas (not needed now)

- Let the admin type a quoted price on a request and turn it into a payable order (the customer gets a "Pay now" link).
- Allow several images per request, or several designs in one request.
- An email to the customer when the status moves to Contacted or Confirmed.

## Next: Phase 10 — Polish and handover

Real photos and content, a verified Mailgun domain, Nodemailer as a second sender, Paystack live keys, SEO and accessibility checks, adding your uncle to `ADMIN_EMAILS`, a short admin guide, and the HNG submission (live URL + repo link).
