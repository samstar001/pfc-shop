# Phase 7 — Customer Accounts

**Goal:** a customer who signs in with Google gets a **My orders** page (history, status, "Pay now" for unpaid orders), checkout fills in their details for them, and orders they placed earlier as a guest show up in their account automatically.

Put this file at `docs/phase-7-setup.md`. One branch: `feat/account-orders` (from `develop`). **No database migration and no new environment variables or packages are needed.**

## What gets built

| Feature                           | How                                                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| My orders page                    | New `GET /account/orders` (signed-in users only) and a real `/account` page                                                  |
| Pay an unpaid order later         | The list links to the order page, where the Phase 6 Pay button already works for the owner (no token needed)                 |
| Guest orders appear after sign-in | On every Google sign-in, orders with no account and the **same email** are attached to the user                              |
| Checkout prefill                  | Name and email come from Google (already done in Phase 4); phone and location now come from the customer's most recent order |
| Order page nudge                  | Guests see "Sign in with Google to keep track of your orders"                                                                |

**Rules the code follows (agent.md D28, D29)**

- Orders are linked by email **only** because Google confirms the email is verified (Phase 3 rejects unverified emails). The match ignores upper/lower case.
- Linking never blocks sign-in: if it fails, the error is logged and the customer still signs in.
- Customers can only ever see **their own** orders. The list is filtered by the signed-in user's id on the server.
- No migration: remembered phone and location are read from the latest order instead of a new profile table.

> **Good to know:** a guest who types someone else's email at checkout would make that order appear in that person's account when they sign in. The order was already emailed to that address, so nothing new is exposed, but it is a reason to keep names and phone numbers out of anything beyond the order itself.

---

# Part 1 — Backend

```bash
git checkout develop && git pull
git checkout -b feat/account-orders
cd backend
```

The scaffold script from the start created empty `src/modules/account/*.ts` files containing `export {};`. **Replace their contents** with the code below.

## 1.1 `src/modules/account/schema.ts`

```ts
import { z } from "zod";

// Query string accepted by GET /account/orders
export const listMyOrdersQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(30).default(10),
});

export type ListMyOrdersQuery = z.infer<typeof listMyOrdersQuery>;
```

## 1.2 `src/modules/account/service.ts`

```ts
import type { User } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import type { ListMyOrdersQuery } from "./schema.js";

// Attach earlier guest orders to this account when the (Google-verified) email matches.
// NEVER throws: a problem here must not stop someone signing in.
export async function linkGuestOrders(
  user: Pick<User, "id" | "email">,
): Promise<number> {
  try {
    const result = await prisma.order.updateMany({
      where: {
        userId: null,
        customerEmail: { equals: user.email, mode: "insensitive" },
      },
      data: { userId: user.id },
    });
    if (result.count > 0)
      console.log(
        `[account] linked ${result.count} guest order(s) to ${user.email}`,
      );
    return result.count;
  } catch (err) {
    console.error("[account] could not link guest orders", err);
    return 0;
  }
}

// The signed-in customer's orders, newest first
export async function listMyOrders(userId: string, q: ListMyOrdersQuery) {
  const where = { userId };

  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: {
        items: {
          select: { productNameSnapshot: true, color: true, quantity: true },
        },
      },
    }),
  ]);

  return {
    items: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      type: o.type,
      status: o.status,
      paymentStatus: o.paymentStatus,
      totalQuantity: o.totalQuantity,
      subtotalNgn: o.subtotalNgn,
      createdAt: o.createdAt,
      // True when the customer can still pay for this order online
      payable:
        o.type === "CATALOGUE" &&
        o.subtotalNgn != null &&
        o.paymentStatus !== "PAID" &&
        o.status !== "CANCELLED",
      lines: o.items.map((i) => ({
        productName: i.productNameSnapshot,
        color: i.color,
        quantity: i.quantity,
      })),
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}

// Details to prefill at checkout: name and email from the account, phone and location from the latest order
export async function getCheckoutDefaults(user: User) {
  const last = await prisma.order.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    select: { customerPhone: true, location: true },
  });

  return {
    name: user.name,
    email: user.email,
    phone: last?.customerPhone ?? "",
    location: last?.location ?? "",
  };
}
```

## 1.3 `src/modules/account/controller.ts`

```ts
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
```

## 1.4 `src/modules/account/routes.ts`

```ts
import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { checkoutDefaults, listMyOrders } from "./controller.js";

// Everything under /account needs a signed-in user (401 otherwise)
export const accountRouter = Router();
accountRouter.use("/account", requireAuth);

accountRouter.get("/account/orders", listMyOrders);
accountRouter.get("/account/checkout-defaults", checkoutDefaults);
```

## 1.5 `src/app.ts` — register the router

Add the import with the others:

```ts
import { accountRouter } from "./modules/account/routes.js";
```

and add the line next to the other feature routers (below `attachUser`, above `notFound`):

```ts
app.use("/api/v1", accountRouter);
```

## 1.6 `src/modules/auth/controller.ts` — link guest orders at sign-in

Add the import:

```ts
import { linkGuestOrders } from "../account/service.js";
```

and in `googleCallback`, add one line right after the user is saved:

```ts
const user = await upsertUser(profile);
await linkGuestOrders(user); // attach earlier guest orders with the same email (never throws)
res.cookie(SESSION_COOKIE, await signSession(user.id), sessionCookieOptions);
```

## 1.7 Test the backend

```bash
npm run dev
```

With the frontend running and you signed in, open in the browser:

```
http://localhost:3000/api/v1/account/orders
http://localhost:3000/api/v1/account/checkout-defaults
```

You should see JSON (your orders and your details). In a private window (signed out) both return `401`.

```bash
cd ..
git add . && git commit -m "feat(backend): account orders api, checkout defaults and guest order linking"
```

---

# Part 2 — Frontend

```bash
cd frontend
```

## 2.1 `src/lib/api/types.ts` — add at the bottom

```ts
// ---------- Customer account ----------
export type AccountOrderSummary = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: string;
  totalQuantity: number;
  subtotalNgn: number | null;
  createdAt: string;
  payable: boolean;
  lines: { productName: string; color: string | null; quantity: number }[];
};
```

## 2.2 `src/lib/orderStatus.ts`

```ts
// Friendly wording of order statuses for customers (the admin sees the raw statuses)
const labels: Record<string, string> = {
  NEW: "Received",
  CONTACTED: "PFC has contacted you",
  CONFIRMED: "Confirmed",
  IN_PRODUCTION: "In production",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

export function customerStatusLabel(status: string): string {
  return labels[status] ?? status;
}
```

## 2.3 `src/app/account/page.tsx` (full file, replaces the Phase 3 version)

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/admin/StatusBadge";
import type { AccountOrderSummary, Paginated } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/AuthProvider";
import { formatDateTime, formatNgn } from "@/lib/format";
import { customerStatusLabel } from "@/lib/orderStatus";

export default function AccountPage() {
  const { user, loading, logout } = useAuth();

  const [data, setData] = useState<Paginated<AccountOrderSummary> | null>(null);
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Load the customer's orders once we know who is signed in (and when the page changes)
  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;

    let cancelled = false; // ignore answers that arrive after the page changed again
    fetch(`/api/v1/account/orders?page=${page}&pageSize=10`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) throw new Error("Could not load your orders");
        return res.json() as Promise<Paginated<AccountOrderSummary>>;
      })
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
    };
  }, [userId, page]);

  if (loading) return <p className="text-gray-600">Loading...</p>;

  // Not signed in: send them to the login page, then back here
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/account" className="underline">
          sign in
        </Link>{" "}
        to see your orders.
      </p>
    );
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div className="mx-auto max-w-3xl">
      {/* Who is signed in */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">My orders</h1>
          <p className="text-sm text-gray-600">
            {user.name} · {user.email}
          </p>
        </div>
        <button onClick={logout} className="rounded border px-4 py-2 text-sm">
          Sign out
        </button>
      </div>

      {error && (
        <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="mt-6 text-gray-600">Loading your orders...</p>
      )}

      {/* Empty state */}
      {data && data.items.length === 0 && (
        <div className="mt-8 text-center">
          <p className="text-gray-600">
            You haven&apos;t placed any orders yet.
          </p>
          <Link
            href="/shop"
            className="mt-4 inline-block rounded bg-black px-5 py-3 text-white"
          >
            Browse the collection
          </Link>
        </div>
      )}

      {/* Order cards */}
      <div className="mt-6 space-y-4">
        {data?.items.map((o) => (
          <div key={o.id} className="rounded-lg border p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Link
                href={`/order/${o.reference}`}
                className="font-semibold underline"
              >
                {o.reference}
              </Link>
              <span className="text-sm text-gray-600">
                {formatDateTime(o.createdAt)}
              </span>
            </div>

            {/* What was ordered */}
            <p className="mt-2 text-sm text-gray-700">
              {o.lines
                .map(
                  (l) =>
                    `${l.productName}${l.color ? ` (${l.color})` : ""} × ${l.quantity}`,
                )
                .join(", ")}
            </p>

            {/* Status, payment and amount */}
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">
                {customerStatusLabel(o.status)}
              </span>
              {o.paymentStatus !== "NOT_APPLICABLE" && (
                <StatusBadge value={o.paymentStatus} />
              )}
              <span className="font-medium">
                {o.subtotalNgn != null
                  ? formatNgn(o.subtotalNgn)
                  : "Quote pending"}
              </span>
              {o.payable && (
                <Link
                  href={`/order/${o.reference}`}
                  className="ml-auto rounded bg-black px-3 py-1 text-white"
                >
                  Pay now
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-4 text-sm">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="disabled:text-gray-400"
          >
            ← Previous
          </button>
          <span>
            Page {page} of {totalPages}
          </span>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="disabled:text-gray-400"
          >
            Next →
          </button>
        </div>
      )}
    </div>
  );
}
```

## 2.4 `src/app/checkout/page.tsx` — also prefill phone and location

Add this effect right after the existing "prefill name and email" effect:

```tsx
// Signed-in customers: also fill in phone and location from their latest order (without overwriting what they typed)
useEffect(() => {
  if (!user) return;
  fetch("/api/v1/account/checkout-defaults", { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : null))
    .then((d: { phone?: string; location?: string } | null) => {
      if (!d) return;
      setPhone((p) => p || d.phone || "");
      setLocation((l) => l || d.location || "");
    })
    .catch(() => {
      /* prefill is a convenience: ignore errors */
    });
}, [user]);
```

## 2.5 `src/components/order/OrderView.tsx` — friendlier status, and a sign-in nudge for guests

Add the imports:

```tsx
import { useAuth } from "@/lib/auth/AuthProvider";
import { customerStatusLabel } from "@/lib/orderStatus";
```

Inside the component, next to the other hooks:

```tsx
const { user } = useAuth();
```

Change the status pill from `Status: {order.status.replaceAll("_", " ")}` to:

```tsx
<span className="rounded-full bg-gray-100 px-3 py-1">
  Status: {customerStatusLabel(order.status)}
</span>
```

and add this block right after the payment-state block (the green/yellow message):

```tsx
{
  /* Guests: invite them to sign in so this order joins their account */
}
{
  !user && order.customerEmail && (
    <p className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-700">
      Want to see all your orders in one place?{" "}
      <a
        href="/api/v1/auth/google/login?next=/account"
        className="font-medium underline"
      >
        Sign in with Google
      </a>{" "}
      using <strong>{order.customerEmail}</strong> and this order will be added
      to your account.
    </p>
  );
}
```

## 2.6 `src/components/layout/UserMenu.tsx` — clearer link, and the admin link goes to the dashboard

In the signed-in block change:

```tsx
<Link href="/account" className="hover:underline">
  My orders
</Link>;
{
  user.role === "ADMIN" && (
    <Link href="/admin" className="rounded border px-2 py-0.5">
      Admin
    </Link>
  );
}
```

(The old link showed the first name and the Admin link pointed at `/admin/products`; the dashboard from Phase 8 lives at `/admin`.)

## 2.7 Test locally

You need two Google accounts: your admin one and your second test email.

1. **Guest order gets linked.** In a private window (signed out) place an order using your **second email** as the order email. Then, in the same window, click the "Sign in with Google" link on the order page and choose that second account. You land on **My orders** and the order is there. In Neon, that `Order` row now has a `userId`.
2. **Order while signed in.** Signed in as the second account, add a product and go to checkout: name and email are filled in, and after step 1 the phone and location are filled from the last order. Place the order: it appears in My orders at once.
3. **Pay later.** In My orders an unpaid order shows **Pay now**. Click it, then pay with the Paystack test card (Phase 6). Afterwards the badge is Paid and the Pay now button is gone.
4. **Privacy.** Sign in with a _different_ Google account and open `/order/<the other account's reference>` (no token): "Order not found". `/api/v1/account/orders` for that account lists only its own orders.
5. **Signed out.** `/account` shows "Please sign in", and `/api/v1/account/orders` returns `401`.
6. **Admin still works.** Signed in as admin, the menu shows My orders and Admin, and Admin opens the dashboard.

```bash
cd ..
git add . && git commit -m "feat(frontend): my orders page, checkout prefill and guest sign-in prompt"
git push -u origin feat/account-orders
git checkout develop && git merge --no-ff feat/account-orders && git push
```

---

# Part 3 — Release

No new environment variables, packages or migrations, so just merge and push:

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

Wait for Render and Vercel to redeploy, then repeat test steps 1 to 3 on `https://pfc-shop.vercel.app`.

## Done when

- [ ] A signed-in customer sees only their own orders on **My orders**, newest first
- [ ] A guest order placed with a customer's Google email appears in their account after they sign in
- [ ] Unpaid catalogue orders show **Pay now** and payment works from there
- [ ] Checkout prefills name, email, phone and location for returning customers
- [ ] Another account cannot open someone else's order, and signed-out users get `401` on `/account/*`
- [ ] Phase 7 ticked in `agent.md` + Progress Log row

## Troubleshooting

- **My orders is empty after a guest order** → the email on the order must match the Google email (case does not matter) and the order must have been placed as a guest. Check the `[account] linked ...` line in the backend logs; if there is none, compare `customerEmail` in Neon with the account's email.
- **`401` on `/api/v1/account/orders` while signed in** → `app.use("/api/v1", accountRouter)` must come after `attachUser` in `app.ts`.
- **Phone and location not prefilled** → the customer needs at least one earlier order linked to their account; new accounts start empty.
- **TypeScript error "Property 'user' does not exist on type 'Request'"** → the Phase 3 file `src/types/express.d.ts` must be inside the `src` folder so TypeScript includes it.
- **Pay now says "Order not found"** → the order belongs to a different account than the one signed in.

## Later ideas (not needed now)

- A profile section where customers save their phone and delivery address (needs a small migration).
- A "Reorder" button that puts a past order's items back in the cart.
- An email to the customer when you mark an order Confirmed or Completed in the admin.

## Next: Phase 9 — Custom design requests

A form where customers upload a reference photo, describe the shoe, choose sizes and quantities, and send a quote request. It reuses orders (type `CUSTOM`), emails both sides, and shows up in the admin orders list with the design image.
