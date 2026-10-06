# Phase 8 — Admin Dashboard

**Goal:** PFC can run the shop without touching the database: see and manage orders, add and edit products and categories, and upload real product photos.

Put this file at `docs/phase-8-setup.md`. Two releases, so you get something useful quickly:

| Branch               | What you get                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------- |
| `feat/admin-orders`  | Dashboard numbers, orders list with filters and search, order detail, status buttons, contact buttons |
| `feat/admin-catalog` | Categories, products (create, edit, publish, delete) and photo upload to Cloudinary                   |

Both start from `develop`. Do the first one completely (code, test, merge to `main`) before starting the second.

**Rules the code follows**

- Every `/admin/*` route is protected **on the server** by `requireAdmin` (Phase 3). Hiding buttons in the UI is only cosmetic.
- Only emails in `ADMIN_EMAILS` become admins. To add your uncle, add his Google email to `ADMIN_EMAILS` on Render, redeploy, and have him sign out and in again.
- Admin pages call the API through the same `/api` rewrite as the rest of the site, so your login cookie is sent automatically.
- Uploaded images are checked by their file signature (not just the extension), limited to 5 MB, and only JPEG, PNG and WebP are accepted.
- Deleting a product never breaks old orders, because each order item keeps a snapshot of the product name and price.

> **Folder names with brackets:** Next.js needs the brackets in `[id]` or the page 404s (the same issue as `[token]`). In a terminal always quote the path: `mkdir -p "src/app/admin/orders/[id]"`.

---

# Branch 1 — `feat/admin-orders`

```bash
git checkout develop && git pull
git checkout -b feat/admin-orders
cd backend
```

No new packages are needed.

## 1.1 Backend

### `src/utils/prismaErrors.ts`

```ts
import { Prisma } from "@prisma/client";

// Returns the Prisma error code (e.g. "P2002" unique clash, "P2025" not found), or null for other errors
export function prismaCode(err: unknown): string | null {
  return err instanceof Prisma.PrismaClientKnownRequestError ? err.code : null;
}
```

### `src/modules/admin/orders.schema.ts`

```ts
import { z } from "zod";

// Allowed values (must match the enums in schema.prisma)
const ORDER_STATUSES = [
  "NEW",
  "CONTACTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
] as const;
const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "PAID",
  "FAILED",
  "NOT_APPLICABLE",
] as const;

// Query string accepted by GET /admin/orders (everything optional)
export const listOrdersQuery = z.object({
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUSES).optional(),
  type: z.enum(["CATALOGUE", "CUSTOM"]).optional(),
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});

export type ListOrdersQuery = z.infer<typeof listOrdersQuery>;

// Body of PATCH /admin/orders/:id/status
export const updateStatusBody = z.object({ status: z.enum(ORDER_STATUSES) });
```

### `src/modules/admin/orders.service.ts`

```ts
import type { OrderStatus, Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { prismaCode } from "../../utils/prismaErrors.js";
import type { ListOrdersQuery } from "./orders.schema.js";

// Numbers shown on the dashboard
export async function getStats() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const [byStatusRows, paid, awaitingPayment, last7Days] = await Promise.all([
    // How many orders in each status
    prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
    // Paid orders and the money they brought in
    prisma.order.aggregate({
      where: { paymentStatus: "PAID" },
      _sum: { subtotalNgn: true },
      _count: { _all: true },
    }),
    // Catalogue orders that still need payment
    prisma.order.count({
      where: {
        type: "CATALOGUE",
        status: { not: "CANCELLED" },
        paymentStatus: { in: ["UNPAID", "PENDING", "FAILED"] },
      },
    }),
    // New orders in the last 7 days
    prisma.order.count({ where: { createdAt: { gte: since } } }),
  ]);

  const byStatus: Record<string, number> = {};
  for (const row of byStatusRows) byStatus[row.status] = row._count._all;

  return {
    totalOrders: byStatusRows.reduce((sum, r) => sum + r._count._all, 0),
    last7Days,
    awaitingPayment,
    paidOrders: paid._count._all,
    paidRevenueNgn: paid._sum.subtotalNgn ?? 0,
    byStatus,
  };
}

// Orders list with filters, search and pagination (newest first)
export async function listOrders(q: ListOrdersQuery) {
  const where: Prisma.OrderWhereInput = {
    ...(q.status ? { status: q.status } : {}),
    ...(q.paymentStatus ? { paymentStatus: q.paymentStatus } : {}),
    ...(q.type ? { type: q.type } : {}),
    // Search in reference, name, phone and email
    ...(q.q
      ? {
          OR: [
            { reference: { contains: q.q, mode: "insensitive" } },
            { customerName: { contains: q.q, mode: "insensitive" } },
            { customerEmail: { contains: q.q, mode: "insensitive" } },
            { customerPhone: { contains: q.q } },
          ],
        }
      : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
      include: { _count: { select: { items: true } } },
    }),
  ]);

  return {
    items: rows.map((o) => ({
      id: o.id,
      reference: o.reference,
      type: o.type,
      status: o.status,
      paymentStatus: o.paymentStatus,
      customerName: o.customerName,
      customerPhone: o.customerPhone,
      totalQuantity: o.totalQuantity,
      subtotalNgn: o.subtotalNgn,
      itemCount: o._count.items,
      createdAt: o.createdAt,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}

// One order with everything the admin needs (null if it does not exist)
export async function getOrderDetail(id: string) {
  const o = await prisma.order.findUnique({
    where: { id },
    include: { items: true, user: { select: { name: true, email: true } } },
  });
  if (!o) return null;

  return {
    id: o.id,
    reference: o.reference,
    type: o.type,
    status: o.status,
    paymentStatus: o.paymentStatus,
    paymentReference: o.paymentReference,
    paidAt: o.paidAt,
    customerName: o.customerName,
    customerPhone: o.customerPhone,
    customerEmail: o.customerEmail,
    location: o.location,
    instructions: o.instructions,
    totalQuantity: o.totalQuantity,
    subtotalNgn: o.subtotalNgn,
    createdAt: o.createdAt,
    updatedAt: o.updatedAt,
    account: o.user, // the signed-in customer who placed it, or null for guests
    items: o.items.map((i) => ({
      id: i.id,
      productName: i.productNameSnapshot,
      category: i.categorySnapshot,
      color: i.color,
      sizeBreakdown: i.sizeBreakdown as Record<string, number>,
      quantity: i.quantity,
      unitPriceNgn: i.unitPriceNgn,
      footwearType: i.footwearType,
      designImageUrl: i.designImageUrl,
      colorNote: i.colorNote,
    })),
  };
}

// Change an order's status; returns false if the order does not exist
export async function updateOrderStatus(
  id: string,
  status: OrderStatus,
): Promise<boolean> {
  try {
    await prisma.order.update({ where: { id }, data: { status } });
    return true;
  } catch (err) {
    if (prismaCode(err) === "P2025") return false;
    throw err;
  }
}
```

### `src/modules/admin/orders.controller.ts`

```ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/errorHandler.js";
import { listOrdersQuery, updateStatusBody } from "./orders.schema.js";
import * as service from "./orders.service.js";

// Order ids in URLs must be UUIDs (anything else is a 422, not a database error)
const idParam = z.string().uuid();

// GET /admin/stats
export async function adminStats(_req: Request, res: Response) {
  res.json(await service.getStats());
}

// GET /admin/orders
export async function adminListOrders(req: Request, res: Response) {
  const query = listOrdersQuery.parse(req.query);
  res.json(await service.listOrders(query));
}

// GET /admin/orders/:id
export async function adminGetOrder(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const order = await service.getOrderDetail(id);
  if (!order) throw new HttpError(404, "NOT_FOUND", "Order not found");
  res.json(order);
}

// PATCH /admin/orders/:id/status
export async function adminUpdateOrderStatus(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  const { status } = updateStatusBody.parse(req.body);
  const found = await service.updateOrderStatus(id, status);
  if (!found) throw new HttpError(404, "NOT_FOUND", "Order not found");
  res.json({ id, status });
}
```

### `src/modules/admin/routes.ts` (full file, replaces the Phase 3 version)

```ts
import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import {
  adminGetOrder,
  adminListOrders,
  adminStats,
  adminUpdateOrderStatus,
} from "./orders.controller.js";

// Every route under /admin requires an admin (checked on the server)
export const adminRouter = Router();
adminRouter.use("/admin", requireAdmin);

// Quick check: 200 for admins, 401 if signed out, 403 for normal users
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true, email: req.user?.email });
});

// Dashboard numbers
adminRouter.get("/admin/stats", adminStats);

// Orders
adminRouter.get("/admin/orders", adminListOrders);
adminRouter.get("/admin/orders/:id", adminGetOrder);
adminRouter.patch("/admin/orders/:id/status", adminUpdateOrderStatus);
```

`app.ts` does not change (`adminRouter` is already mounted from Phase 3).

### Test the backend

```bash
npm run dev
```

The easiest way to call admin routes is in the browser while signed in as admin. Start the frontend too, sign in with your admin Google account, then open:

```
http://localhost:3000/api/v1/admin/stats
http://localhost:3000/api/v1/admin/orders
```

You should see JSON. Signed out (private window) you should get `401`, and with a non-admin Google account `403`.

```bash
cd ..
git add . && git commit -m "feat(backend): admin stats and orders api"
```

## 1.2 Frontend

```bash
cd frontend
```

### `src/lib/api/types.ts` — add at the bottom

```ts
// ---------- Admin ----------
export type AdminStats = {
  totalOrders: number;
  last7Days: number;
  awaitingPayment: number;
  paidOrders: number;
  paidRevenueNgn: number;
  byStatus: Record<string, number>;
};

export type AdminOrderSummary = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: string;
  customerName: string;
  customerPhone: string;
  totalQuantity: number;
  subtotalNgn: number | null;
  itemCount: number;
  createdAt: string;
};

export type AdminOrderDetail = {
  id: string;
  reference: string;
  type: "CATALOGUE" | "CUSTOM";
  status: string;
  paymentStatus: string;
  paymentReference: string | null;
  paidAt: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  location: string | null;
  instructions: string | null;
  totalQuantity: number;
  subtotalNgn: number | null;
  createdAt: string;
  updatedAt: string;
  account: { name: string; email: string } | null;
  items: {
    id: string;
    productName: string;
    category: string | null;
    color: string | null;
    sizeBreakdown: Record<string, number>;
    quantity: number;
    unitPriceNgn: number | null;
    footwearType: string | null;
    designImageUrl: string | null;
    colorNote: string | null;
  }[];
};
```

### `src/lib/format.ts` — add this function

```ts
// Format an ISO date for the admin, in Nigerian time, e.g. "5 Oct 2026, 4:05 pm"
export function formatDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Africa/Lagos",
  }).format(new Date(iso));
}
```

### `src/lib/phone.ts`

```ts
// Turn a Nigerian phone number into the digits-only format wa.me needs (08012345678 → 2348012345678)
export function toWhatsappNumber(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("234")) return digits;
  if (digits.startsWith("0")) return `234${digits.slice(1)}`;
  return digits;
}
```

### `src/lib/admin/constants.ts`

```ts
// Status values (must match the backend enums)
export const ORDER_STATUSES = [
  "NEW",
  "CONTACTED",
  "CONFIRMED",
  "IN_PRODUCTION",
  "COMPLETED",
  "CANCELLED",
] as const;
export const PAYMENT_STATUSES = [
  "UNPAID",
  "PENDING",
  "PAID",
  "FAILED",
  "NOT_APPLICABLE",
] as const;

// "IN_PRODUCTION" → "In production"
export function statusLabel(value: string): string {
  const text = value.replaceAll("_", " ").toLowerCase();
  return text.charAt(0).toUpperCase() + text.slice(1);
}
```

### `src/lib/api/adminClient.ts`

```ts
// Error carrying the HTTP status so pages can react to 401/403
export class AdminApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

// Browser-side helper for admin API calls (goes through the /api rewrite, the session cookie is sent automatically)
export async function adminFetch<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  // File uploads (FormData) must set their own content type, so only add JSON headers for normal bodies
  const isForm =
    typeof FormData !== "undefined" && init?.body instanceof FormData;

  const res = await fetch(`/api/v1${path}`, {
    ...init,
    cache: "no-store",
    headers: {
      ...(isForm ? {} : { "Content-Type": "application/json" }),
      ...(init?.headers ?? {}),
    },
  });

  const data = await res.json().catch(() => null);
  if (!res.ok) {
    // Prefer the first field-level message, then the general one
    const message =
      data?.error?.details?.[0]?.issue ??
      data?.error?.message ??
      "Request failed";
    throw new AdminApiError(res.status, message);
  }
  return data as T;
}
```

### `src/components/admin/StatusBadge.tsx`

```tsx
import { statusLabel } from "@/lib/admin/constants";

// Colors for each order and payment status
const styles: Record<string, string> = {
  NEW: "bg-blue-100 text-blue-800",
  CONTACTED: "bg-purple-100 text-purple-800",
  CONFIRMED: "bg-indigo-100 text-indigo-800",
  IN_PRODUCTION: "bg-amber-100 text-amber-800",
  COMPLETED: "bg-green-100 text-green-800",
  CANCELLED: "bg-gray-200 text-gray-700",
  UNPAID: "bg-red-100 text-red-800",
  PENDING: "bg-yellow-100 text-yellow-800",
  PAID: "bg-green-100 text-green-800",
  FAILED: "bg-red-100 text-red-800",
  NOT_APPLICABLE: "bg-gray-100 text-gray-600",
};

// Small colored pill used in the admin tables
export default function StatusBadge({ value }: { value: string }) {
  return (
    <span
      className={`whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[value] ?? "bg-gray-100 text-gray-700"}`}
    >
      {statusLabel(value)}
    </span>
  );
}
```

### `src/app/admin/layout.tsx` (full file, replaces the Phase 3 version: adds the admin menu)

```tsx
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth/AuthProvider";

// Admin sections
const nav = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/orders", label: "Orders" },
  { href: "/admin/products", label: "Products" },
  { href: "/admin/categories", label: "Categories" },
];

// UI guard only: the real protection is on the server (requireAdmin)
export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();
  const pathname = usePathname();

  if (loading) return <p className="text-gray-600">Loading...</p>;

  // Signed out
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/admin" className="underline">
          sign in
        </Link>{" "}
        as an admin.
      </p>
    );
  }

  // Signed in but not an admin
  if (user.role !== "ADMIN")
    return <p>You don&apos;t have access to this page.</p>;

  return (
    <div>
      {/* Admin menu */}
      <nav className="mb-6 flex flex-wrap gap-2 border-b pb-3 text-sm">
        {nav.map((item) => {
          const active =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`rounded-full px-4 py-1 ${active ? "bg-black text-white" : "border hover:bg-gray-50"}`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
      {children}
    </div>
  );
}
```

### `src/app/admin/page.tsx` (new: the dashboard)

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminStats } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

// One number card
function Card({
  label,
  value,
  href,
}: {
  label: string;
  value: string | number;
  href?: string;
}) {
  const body = (
    <div className="rounded-lg border p-4 hover:bg-gray-50">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="mt-1 text-2xl font-bold">{value}</p>
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load the numbers once
  useEffect(() => {
    adminFetch<AdminStats>("/admin/stats")
      .then(setStats)
      .catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <p className="text-red-700">{error}</p>;
  if (!stats) return <p className="text-gray-600">Loading...</p>;

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card
          label="New orders (to contact)"
          value={stats.byStatus.NEW ?? 0}
          href="/admin/orders"
        />
        <Card
          label="Awaiting payment"
          value={stats.awaitingPayment}
          href="/admin/orders"
        />
        <Card label="Orders in the last 7 days" value={stats.last7Days} />
        <Card label="Paid orders" value={stats.paidOrders} />
        <Card
          label="Paid revenue (items)"
          value={formatNgn(stats.paidRevenueNgn)}
        />
        <Card
          label="All orders"
          value={stats.totalOrders}
          href="/admin/orders"
        />
      </div>

      <h2 className="mt-8 font-semibold">Orders by status</h2>
      <div className="mt-2 flex flex-wrap gap-2 text-sm">
        {Object.entries(stats.byStatus).map(([status, count]) => (
          <span key={status} className="rounded-full border px-3 py-1">
            {status.replaceAll("_", " ")}: {count}
          </span>
        ))}
        {Object.keys(stats.byStatus).length === 0 && (
          <span className="text-gray-600">No orders yet.</span>
        )}
      </div>
    </div>
  );
}
```

### `src/app/admin/orders/page.tsx` (replaces the TODO placeholder)

```tsx
"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/admin/StatusBadge";
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  statusLabel,
} from "@/lib/admin/constants";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminOrderSummary, Paginated } from "@/lib/api/types";
import { formatDateTime, formatNgn } from "@/lib/format";

export default function AdminOrdersPage() {
  // Filters
  const [status, setStatus] = useState("");
  const [payment, setPayment] = useState("");
  const [type, setType] = useState("");
  const [search, setSearch] = useState(""); // what is typed
  const [query, setQuery] = useState(""); // what was submitted
  const [page, setPage] = useState(1);

  // Data
  const [data, setData] = useState<Paginated<AdminOrderSummary> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Reload whenever a filter or the page changes
  useEffect(() => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (status) qs.set("status", status);
    if (payment) qs.set("paymentStatus", payment);
    if (type) qs.set("type", type);
    if (query) qs.set("q", query);

    let cancelled = false; // ignore answers that arrive after the filters changed again
    setLoading(true);
    adminFetch<Paginated<AdminOrderSummary>>(`/admin/orders?${qs.toString()}`)
      .then((d) => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));

    return () => {
      cancelled = true;
    };
  }, [status, payment, type, query, page]);

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;
  const selectClass = "rounded border px-2 py-1 text-sm";

  return (
    <div>
      <h1 className="text-2xl font-bold">Orders</h1>

      {/* Filters and search */}
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <select
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className={selectClass}
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        <select
          value={payment}
          onChange={(e) => {
            setPayment(e.target.value);
            setPage(1);
          }}
          className={selectClass}
          aria-label="Filter by payment"
        >
          <option value="">All payments</option>
          {PAYMENT_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) => {
            setType(e.target.value);
            setPage(1);
          }}
          className={selectClass}
          aria-label="Filter by type"
        >
          <option value="">All types</option>
          <option value="CATALOGUE">Catalogue</option>
          <option value="CUSTOM">Custom design</option>
        </select>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(search.trim());
            setPage(1);
          }}
          className="flex gap-2"
        >
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reference, name, phone, email"
            className="w-64 rounded border px-3 py-1 text-sm"
          />
          <button className="rounded bg-black px-3 py-1 text-sm text-white">
            Search
          </button>
        </form>
      </div>

      {error && <p className="mt-4 text-red-700">{error}</p>}

      {/* Orders table */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead className="border-b text-gray-600">
            <tr>
              <th className="py-2 pr-3">Order</th>
              <th className="py-2 pr-3">Customer</th>
              <th className="py-2 pr-3">Pairs</th>
              <th className="py-2 pr-3">Amount</th>
              <th className="py-2 pr-3">Payment</th>
              <th className="py-2 pr-3">Status</th>
              <th className="py-2">Placed</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((o) => (
              <tr key={o.id} className="border-b align-top">
                <td className="py-2 pr-3">
                  <Link
                    href={`/admin/orders/${o.id}`}
                    className="font-medium underline"
                  >
                    {o.reference}
                  </Link>
                  {o.type === "CUSTOM" && (
                    <span className="ml-2 text-xs text-gray-500">custom</span>
                  )}
                </td>
                <td className="py-2 pr-3">
                  {o.customerName}
                  <br />
                  <span className="text-gray-600">{o.customerPhone}</span>
                </td>
                <td className="py-2 pr-3">{o.totalQuantity}</td>
                <td className="py-2 pr-3">
                  {o.subtotalNgn != null ? formatNgn(o.subtotalNgn) : "Quote"}
                </td>
                <td className="py-2 pr-3">
                  <StatusBadge value={o.paymentStatus} />
                </td>
                <td className="py-2 pr-3">
                  <StatusBadge value={o.status} />
                </td>
                <td className="py-2 whitespace-nowrap">
                  {formatDateTime(o.createdAt)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {loading && <p className="mt-3 text-gray-600">Loading...</p>}
        {!loading && data?.items.length === 0 && (
          <p className="mt-3 text-gray-600">No orders match.</p>
        )}
      </div>

      {/* Pagination */}
      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
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

### `src/app/admin/orders/[id]/page.tsx` (new)

```bash
mkdir -p "src/app/admin/orders/[id]"
```

```tsx
"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import StatusBadge from "@/components/admin/StatusBadge";
import { ORDER_STATUSES, statusLabel } from "@/lib/admin/constants";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminOrderDetail } from "@/lib/api/types";
import { formatDateTime, formatNgn } from "@/lib/format";
import { toWhatsappNumber } from "@/lib/phone";

export default function AdminOrderPage() {
  const { id } = useParams<{ id: string }>();

  const [order, setOrder] = useState<AdminOrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Load the order
  useEffect(() => {
    adminFetch<AdminOrderDetail>(`/admin/orders/${id}`)
      .then((o) => {
        setOrder(o);
        setNewStatus(o.status);
      })
      .catch((e: Error) => setError(e.message));
  }, [id]);

  // Save the new status
  async function saveStatus() {
    if (!order || newStatus === order.status) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await adminFetch(`/admin/orders/${order.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: newStatus }),
      });
      setOrder({ ...order, status: newStatus });
      setSaved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  if (error && !order) return <p className="text-red-700">{error}</p>;
  if (!order) return <p className="text-gray-600">Loading...</p>;

  const whatsapp = `https://wa.me/${toWhatsappNumber(order.customerPhone)}?text=${encodeURIComponent(
    `Hello ${order.customerName.split(" ")[0]}, this is PFC about your order ${order.reference}.`,
  )}`;

  return (
    <div className="max-w-3xl">
      <Link href="/admin/orders" className="text-sm underline">
        ← All orders
      </Link>

      {/* Title and badges */}
      <h1 className="mt-3 text-2xl font-bold">{order.reference}</h1>
      <p className="text-sm text-gray-600">
        Placed {formatDateTime(order.createdAt)}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <StatusBadge value={order.status} />
        <StatusBadge value={order.paymentStatus} />
        {order.type === "CUSTOM" && (
          <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs">
            Custom design
          </span>
        )}
      </div>

      {/* Change status */}
      <div className="mt-6 flex flex-wrap items-center gap-2 rounded-lg border p-4">
        <label className="text-sm font-medium" htmlFor="status">
          Order status
        </label>
        <select
          id="status"
          value={newStatus}
          onChange={(e) => {
            setNewStatus(e.target.value);
            setSaved(false);
          }}
          className="rounded border px-2 py-1 text-sm"
        >
          {ORDER_STATUSES.map((s) => (
            <option key={s} value={s}>
              {statusLabel(s)}
            </option>
          ))}
        </select>
        <button
          onClick={saveStatus}
          disabled={saving || newStatus === order.status}
          className="rounded bg-black px-4 py-1 text-sm text-white disabled:bg-gray-300"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {saved && <span className="text-sm text-green-700">Saved</span>}
        {error && <span className="text-sm text-red-700">{error}</span>}
      </div>

      {/* Customer */}
      <div className="mt-6 rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Customer</h2>
        <p className="mt-2">{order.customerName}</p>
        <p>{order.customerPhone}</p>
        {order.customerEmail && <p>{order.customerEmail}</p>}
        {order.location && <p>Location: {order.location}</p>}
        {order.instructions && (
          <p className="mt-2">Notes: {order.instructions}</p>
        )}
        {order.account && (
          <p className="mt-2 text-gray-600">
            Signed-in account: {order.account.name} ({order.account.email})
          </p>
        )}

        {/* Contact buttons */}
        <div className="mt-3 flex flex-wrap gap-2">
          <a
            href={whatsapp}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded bg-green-600 px-3 py-1.5 text-white"
          >
            WhatsApp
          </a>
          <a
            href={`tel:${order.customerPhone}`}
            className="rounded border px-3 py-1.5"
          >
            Call
          </a>
          {order.customerEmail && (
            <a
              href={`mailto:${order.customerEmail}`}
              className="rounded border px-3 py-1.5"
            >
              Email
            </a>
          )}
        </div>
      </div>

      {/* Items */}
      <div className="mt-6 space-y-3">
        <h2 className="font-semibold">Items</h2>
        {order.items.map((i) => (
          <div key={i.id} className="rounded-lg border p-4 text-sm">
            <p className="font-medium">
              {i.productName}
              {i.color ? ` · ${i.color}` : ""}
              {i.category ? (
                <span className="font-normal text-gray-500">
                  {" "}
                  ({i.category})
                </span>
              ) : null}
            </p>
            <p className="text-gray-600">
              {Object.entries(i.sizeBreakdown)
                .map(([s, n]) => `Size ${s}: ${n}`)
                .join(" · ")}
            </p>
            {i.footwearType && <p>Type: {i.footwearType}</p>}
            {i.colorNote && <p>Color note: {i.colorNote}</p>}
            {i.designImageUrl && (
              <a
                href={i.designImageUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                View design image
              </a>
            )}
            <p className="mt-1">
              {i.quantity} pairs
              {i.unitPriceNgn != null
                ? ` · ${formatNgn(i.quantity * i.unitPriceNgn)}`
                : ""}
            </p>
          </div>
        ))}
        <p className="flex justify-between font-semibold">
          <span>{order.totalQuantity} pairs</span>
          <span>
            {order.subtotalNgn != null
              ? formatNgn(order.subtotalNgn)
              : "Quote needed"}
          </span>
        </p>
      </div>

      {/* Payment details */}
      <div className="mt-6 rounded-lg border p-4 text-sm">
        <h2 className="font-semibold">Payment</h2>
        <p className="mt-2">Status: {statusLabel(order.paymentStatus)}</p>
        {order.paidAt && <p>Paid: {formatDateTime(order.paidAt)}</p>}
        {order.paymentReference && (
          <p className="break-all text-gray-600">
            Reference: {order.paymentReference}
          </p>
        )}
        <p className="mt-2 text-xs text-gray-500">
          Payment covers the items. Agree the delivery fee with the customer
          separately.
        </p>
      </div>
    </div>
  );
}
```

### Test locally

1. Sign in with your admin Google account and open `http://localhost:3000/admin`. You should see the menu and the numbers.
2. **Orders**: your test orders appear. Try each filter, search for part of a reference, and open one.
3. Change an order to **Contacted** and save, then go back to the list: the badge changed.
4. Click **WhatsApp**: a chat opens with a pre-filled greeting. Check the number is in `234...` form.
5. Sign out and open `/admin`: you see "Please sign in". Sign in with a non-admin Google account: "You don't have access". Also open `/api/v1/admin/stats` in that session: `403`.

```bash
cd ..
git add . && git commit -m "feat(frontend): admin dashboard, orders list and order detail"
git push -u origin feat/admin-orders
git checkout develop && git merge --no-ff feat/admin-orders && git push
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

Render and Vercel redeploy. Repeat test steps 1 to 3 on the live site. **Add your uncle:** put his Google email in `ADMIN_EMAILS` on Render (comma-separated, no spaces needed), redeploy, and ask him to sign out and in once.

---

# Branch 2 — `feat/admin-catalog`

## Cloudinary setup (≈5 min)

1. Sign up at https://cloudinary.com (free plan).
2. On the **Dashboard** copy the **Cloud name**, **API Key** and **API Secret**.
3. Add to `backend/.env` (never commit them), and the same names (empty values) to `.env.example`:

```
CLOUDINARY_CLOUD_NAME=your-cloud-name
CLOUDINARY_API_KEY=your-api-key
CLOUDINARY_API_SECRET=your-api-secret
```

## 2.1 Backend

```bash
git checkout develop && git pull
git checkout -b feat/admin-catalog
cd backend
npm i multer cloudinary
npm i -D @types/multer
```

### `src/config/env.ts` — add these lines

```ts
  // Image uploads (Cloudinary). Optional: without them, uploads return a clear "not set up" error.
  CLOUDINARY_CLOUD_NAME: z.string().default(""),
  CLOUDINARY_API_KEY: z.string().default(""),
  CLOUDINARY_API_SECRET: z.string().default(""),
```

### `src/utils/slug.ts`

```ts
// "PFC Classic Slide!" → "pfc-classic-slide" (used for page URLs)
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "") // remove accents
    .replace(/[^a-z0-9]+/g, "-") // anything else becomes a dash
    .replace(/^-+|-+$/g, "") // trim dashes
    .slice(0, 80);
}
```

### `src/utils/image.ts`

```ts
export type ImageType = "jpeg" | "png" | "webp";

// Identify an image by its first bytes ("magic bytes"), not by the file name the user chose
export function detectImageType(buf: Buffer): ImageType | null {
  // JPEG: FF D8 FF
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
    return "jpeg";

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf.length >= 8 &&
    buf
      .subarray(0, 8)
      .equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return "png";

  // WebP: "RIFF" .... "WEBP"
  if (
    buf.length >= 12 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WEBP"
  )
    return "webp";

  return null;
}
```

### `src/services/cloudinary.ts`

```ts
import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

// Uploads only work when all three Cloudinary settings are present
export function cloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );
}

if (cloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Upload an image buffer to Cloudinary and return its https URL
export function uploadImage(buffer: Buffer, folder: string): Promise<string> {
  if (!cloudinaryConfigured()) {
    throw new HttpError(
      503,
      "UPLOADS_UNAVAILABLE",
      "Image uploads are not set up yet",
    );
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `pfc/${folder}`, resource_type: "image" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
```

### `src/middleware/upload.ts`

```ts
import multer from "multer";

// Accept ONE file in a form field called "file", kept in memory, max 5 MB
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("file");
```

### `src/middleware/errorHandler.ts` — handle upload errors

Add the import at the top:

```ts
import multer from "multer";
```

and add this block inside `errorHandler`, right after the `HttpError` block:

```ts
// Upload problems from multer (file too big, wrong field name, ...)
if (err instanceof multer.MulterError) {
  const tooBig = err.code === "LIMIT_FILE_SIZE";
  return res.status(tooBig ? 413 : 400).json({
    error: {
      code: tooBig ? "FILE_TOO_LARGE" : "UPLOAD_ERROR",
      message: tooBig ? "Image must be 5 MB or smaller" : "Upload failed",
    },
  });
}
```

### `src/modules/admin/catalog.schema.ts`

```ts
import { z } from "zod";

// One product color, e.g. { name: "Black", hex: "#111111" }
const colorSchema = z.object({
  name: z.string().trim().min(1, "Enter a color name").max(30),
  hex: z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #111111"),
});

// Fields shared by create and edit.
// NOTE: no .default() here on purpose. With PATCH (partial), defaults could silently reset flags.
const productFields = {
  name: z.string().trim().min(2, "Enter a product name").max(120),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and dashes",
    )
    .max(140)
    .optional(),
  description: z.string().trim().min(5, "Add a short description").max(2000),
  categoryId: z.string().uuid("Choose a category"),
  priceNgn: z
    .number()
    .int("Price must be a whole number")
    .min(100, "Price is too low")
    .max(10_000_000),
  colors: z.array(colorSchema).min(1, "Add at least one color").max(12),
  sizes: z
    .array(z.number().int().min(20).max(60))
    .min(1, "Add at least one size")
    .max(30),
  images: z
    .array(
      z
        .string()
        .url()
        .refine((u) => u.startsWith("https://"), "Images must be https links"),
    )
    .max(8),
  isFeatured: z.boolean().optional(),
  isNew: z.boolean().optional(),
  isPopular: z.boolean().optional(),
  isCustomizable: z.boolean().optional(),
  isPublished: z.boolean().optional(),
};

export const createProductBody = z.object(productFields);
export const updateProductBody = z.object(productFields).partial(); // every field optional when editing
export type CreateProductBody = z.infer<typeof createProductBody>;
export type UpdateProductBody = z.infer<typeof updateProductBody>;

// GET /admin/products query
export const listProductsQuery = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().uuid().optional(),
  published: z.enum(["true", "false"]).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
});
export type ListProductsQuery = z.infer<typeof listProductsQuery>;

// Categories
const categoryFields = {
  name: z.string().trim().min(2, "Enter a category name").max(60),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(
      /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
      "Use lowercase letters, numbers and dashes",
    )
    .max(80)
    .optional(),
  description: z.string().trim().max(300).nullable().optional(),
  sortOrder: z.number().int().min(0).max(1000).optional(),
  isActive: z.boolean().optional(),
};
export const createCategoryBody = z.object(categoryFields);
export const updateCategoryBody = z.object(categoryFields).partial();
export type CreateCategoryBody = z.infer<typeof createCategoryBody>;
export type UpdateCategoryBody = z.infer<typeof updateCategoryBody>;
```

### `src/modules/admin/catalog.service.ts`

```ts
import { randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";
import { prismaCode } from "../../utils/prismaErrors.js";
import { slugify } from "../../utils/slug.js";
import type {
  CreateCategoryBody,
  CreateProductBody,
  ListProductsQuery,
  UpdateCategoryBody,
  UpdateProductBody,
} from "./catalog.schema.js";

// ---------- Products ----------

// Products list for the admin (includes unpublished ones)
export async function listProducts(q: ListProductsQuery) {
  const where: Prisma.ProductWhereInput = {
    ...(q.q ? { name: { contains: q.q, mode: "insensitive" } } : {}),
    ...(q.category ? { categoryId: q.category } : {}),
    ...(q.published ? { isPublished: q.published === "true" } : {}),
  };

  const [total, rows] = await prisma.$transaction([
    prisma.product.count({ where }),
    prisma.product.findMany({
      where,
      include: { category: { select: { id: true, name: true } } },
      orderBy: [{ createdAt: "desc" }, { name: "asc" }],
      skip: (q.page - 1) * q.pageSize,
      take: q.pageSize,
    }),
  ]);

  return {
    items: rows.map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      category: p.category,
      thumbnail: p.images[0] ?? null,
      priceNgn: p.priceNgn,
      isPublished: p.isPublished,
      isFeatured: p.isFeatured,
      isNew: p.isNew,
      isPopular: p.isPopular,
    })),
    page: q.page,
    pageSize: q.pageSize,
    total,
  };
}

// One product with all fields (for the edit form)
export async function getProduct(id: string) {
  const p = await prisma.product.findUnique({ where: { id } });
  if (!p) return null;
  return {
    id: p.id,
    name: p.name,
    slug: p.slug,
    description: p.description,
    categoryId: p.categoryId,
    priceNgn: p.priceNgn,
    colors: p.colors as { name: string; hex: string }[],
    sizes: p.sizes,
    images: p.images,
    isPublished: p.isPublished,
    isFeatured: p.isFeatured,
    isNew: p.isNew,
    isPopular: p.isPopular,
    isCustomizable: p.isCustomizable,
  };
}

// Create a product. If the URL name (slug) is taken, an automatic one gets a random suffix.
export async function createProduct(b: CreateProductBody) {
  const base = b.slug ?? (slugify(b.name) || "product");

  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      const p = await prisma.product.create({
        data: {
          name: b.name,
          slug,
          description: b.description,
          categoryId: b.categoryId,
          priceNgn: b.priceNgn,
          colors: b.colors,
          sizes: b.sizes,
          images: b.images,
          isFeatured: b.isFeatured ?? false,
          isNew: b.isNew ?? false,
          isPopular: b.isPopular ?? false,
          isCustomizable: b.isCustomizable ?? true,
          isPublished: b.isPublished ?? true,
        },
      });
      return { id: p.id, slug: p.slug };
    } catch (err) {
      const code = prismaCode(err);
      if (code === "P2002") {
        if (b.slug)
          throw new HttpError(
            409,
            "SLUG_TAKEN",
            "That URL name is already used by another product",
          );
        continue; // automatic slug clashed: try again with a suffix
      }
      if (code === "P2003")
        throw new HttpError(
          422,
          "INVALID_CATEGORY",
          "That category does not exist",
        );
      throw err;
    }
  }
  throw new HttpError(
    409,
    "SLUG_TAKEN",
    "Could not create a unique URL name, please type one in",
  );
}

// Edit a product (only the fields that were sent change)
export async function updateProduct(id: string, patch: UpdateProductBody) {
  try {
    await prisma.product.update({ where: { id }, data: patch });
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Product not found");
    if (code === "P2002")
      throw new HttpError(
        409,
        "SLUG_TAKEN",
        "That URL name is already used by another product",
      );
    if (code === "P2003")
      throw new HttpError(
        422,
        "INVALID_CATEGORY",
        "That category does not exist",
      );
    throw err;
  }
}

// Delete a product. Old orders keep working because their items store a snapshot of the product.
export async function deleteProduct(id: string) {
  try {
    await prisma.product.delete({ where: { id } });
  } catch (err) {
    if (prismaCode(err) === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Product not found");
    throw err;
  }
}

// ---------- Categories ----------

// All categories (including inactive) with how many products each has
export async function listCategories() {
  const rows = await prisma.category.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { _count: { select: { products: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    sortOrder: c.sortOrder,
    isActive: c.isActive,
    productCount: c._count.products,
  }));
}

export async function createCategory(b: CreateCategoryBody) {
  const base = b.slug ?? (slugify(b.name) || "category");

  for (let attempt = 0; attempt < 4; attempt++) {
    const slug =
      attempt === 0 ? base : `${base}-${randomBytes(2).toString("hex")}`;
    try {
      const c = await prisma.category.create({
        data: {
          name: b.name,
          slug,
          description: b.description ?? null,
          sortOrder: b.sortOrder ?? 0,
          isActive: b.isActive ?? true,
        },
      });
      return { id: c.id, slug: c.slug };
    } catch (err) {
      if (prismaCode(err) === "P2002") {
        if (b.slug)
          throw new HttpError(
            409,
            "SLUG_TAKEN",
            "That URL name is already used by another category",
          );
        continue;
      }
      throw err;
    }
  }
  throw new HttpError(
    409,
    "SLUG_TAKEN",
    "Could not create a unique URL name, please type one in",
  );
}

export async function updateCategory(id: string, patch: UpdateCategoryBody) {
  try {
    await prisma.category.update({ where: { id }, data: patch });
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Category not found");
    if (code === "P2002")
      throw new HttpError(
        409,
        "SLUG_TAKEN",
        "That URL name is already used by another category",
      );
    throw err;
  }
}

// A category with products cannot be deleted (move or delete its products first, or just hide it)
export async function deleteCategory(id: string) {
  try {
    await prisma.category.delete({ where: { id } });
  } catch (err) {
    const code = prismaCode(err);
    if (code === "P2025")
      throw new HttpError(404, "NOT_FOUND", "Category not found");
    if (code === "P2003") {
      throw new HttpError(
        409,
        "CATEGORY_HAS_PRODUCTS",
        "This category still has products. Hide it instead, or move its products first.",
      );
    }
    throw err;
  }
}
```

### `src/modules/admin/catalog.controller.ts`

```ts
import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/errorHandler.js";
import { detectImageType } from "../../utils/image.js";
import { uploadImage } from "../../services/cloudinary.js";
import {
  createCategoryBody,
  createProductBody,
  listProductsQuery,
  updateCategoryBody,
  updateProductBody,
} from "./catalog.schema.js";
import * as service from "./catalog.service.js";

const idParam = z.string().uuid();

// ---------- Products ----------
export async function adminListProducts(req: Request, res: Response) {
  res.json(await service.listProducts(listProductsQuery.parse(req.query)));
}

export async function adminGetProduct(req: Request, res: Response) {
  const product = await service.getProduct(idParam.parse(req.params.id));
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found");
  res.json(product);
}

export async function adminCreateProduct(req: Request, res: Response) {
  const created = await service.createProduct(
    createProductBody.parse(req.body),
  );
  res.status(201).json(created);
}

export async function adminUpdateProduct(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  await service.updateProduct(id, updateProductBody.parse(req.body));
  res.json({ ok: true });
}

export async function adminDeleteProduct(req: Request, res: Response) {
  await service.deleteProduct(idParam.parse(req.params.id));
  res.json({ ok: true });
}

// ---------- Categories ----------
export async function adminListCategories(_req: Request, res: Response) {
  res.json({ items: await service.listCategories() });
}

export async function adminCreateCategory(req: Request, res: Response) {
  res
    .status(201)
    .json(await service.createCategory(createCategoryBody.parse(req.body)));
}

export async function adminUpdateCategory(req: Request, res: Response) {
  await service.updateCategory(
    idParam.parse(req.params.id),
    updateCategoryBody.parse(req.body),
  );
  res.json({ ok: true });
}

export async function adminDeleteCategory(req: Request, res: Response) {
  await service.deleteCategory(idParam.parse(req.params.id));
  res.json({ ok: true });
}

// ---------- Image upload ----------
// POST /admin/uploads/image (multipart form, field "file") → { url }
export async function adminUploadImage(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new HttpError(400, "NO_FILE", "Choose an image to upload");

  // Check the real file type from its bytes
  if (!detectImageType(file.buffer)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_TYPE",
      "Only JPEG, PNG or WebP images are allowed",
    );
  }

  try {
    const url = await uploadImage(file.buffer, "products");
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

### `src/modules/admin/routes.ts` — add the catalog routes

Add the imports:

```ts
import { imageUpload } from "../../middleware/upload.js";
import {
  adminCreateCategory,
  adminCreateProduct,
  adminDeleteCategory,
  adminDeleteProduct,
  adminGetProduct,
  adminListCategories,
  adminListProducts,
  adminUpdateCategory,
  adminUpdateProduct,
  adminUploadImage,
} from "./catalog.controller.js";
```

and append at the bottom:

```ts
// Products
adminRouter.get("/admin/products", adminListProducts);
adminRouter.post("/admin/products", adminCreateProduct);
adminRouter.get("/admin/products/:id", adminGetProduct);
adminRouter.patch("/admin/products/:id", adminUpdateProduct);
adminRouter.delete("/admin/products/:id", adminDeleteProduct);

// Categories
adminRouter.get("/admin/categories", adminListCategories);
adminRouter.post("/admin/categories", adminCreateCategory);
adminRouter.patch("/admin/categories/:id", adminUpdateCategory);
adminRouter.delete("/admin/categories/:id", adminDeleteCategory);

// Image upload (multer reads the file first)
adminRouter.post("/admin/uploads/image", imageUpload, adminUploadImage);
```

### Test the backend

```bash
npm run dev
```

Signed in as admin, open `http://localhost:3000/api/v1/admin/products` and `.../admin/categories` in the browser: JSON lists. (Uploads are tested from the form below.)

```bash
cd ..
git add . && git commit -m "feat(backend): admin products, categories and cloudinary image upload"
```

## 2.2 Frontend

```bash
cd frontend
```

### `src/lib/api/types.ts` — add at the bottom

```ts
export type AdminCategory = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  productCount: number;
};

export type AdminProductSummary = {
  id: string;
  name: string;
  slug: string;
  category: { id: string; name: string };
  thumbnail: string | null;
  priceNgn: number;
  isPublished: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
};

export type AdminProductDetail = {
  id: string;
  name: string;
  slug: string;
  description: string;
  categoryId: string;
  priceNgn: number;
  colors: Color[];
  sizes: number[];
  images: string[];
  isPublished: boolean;
  isFeatured: boolean;
  isNew: boolean;
  isPopular: boolean;
  isCustomizable: boolean;
};
```

(`Color` and `Paginated` already exist from Phase 2.)

### `src/lib/sizes.ts`

```ts
// "38-46" → [38..46];  "38, 40, 42-44" → [38, 40, 42, 43, 44]
export function parseSizes(input: string): number[] {
  const sizes = new Set<number>();

  for (const part of input.split(",")) {
    const text = part.trim();
    if (!text) continue;

    // A range like 38-46
    const range = text.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      const from = Math.min(Number(range[1]), Number(range[2]));
      const to = Math.max(Number(range[1]), Number(range[2]));
      for (let n = from; n <= to && sizes.size < 60; n++) sizes.add(n);
    } else if (/^\d+$/.test(text)) {
      sizes.add(Number(text)); // a single size
    }
  }

  return [...sizes].sort((a, b) => a - b);
}
```

### `src/components/admin/ImageUploader.tsx`

```tsx
"use client";

import Image from "next/image";
import { useRef, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";

// Upload product photos, remove them, and choose which one is the main image (the first one)
export default function ImageUploader({
  images,
  onChange,
}: {
  images: string[];
  onChange: (next: string[]) => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  // Upload each chosen file, one at a time
  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError(null);

    let next = [...images];
    for (const file of Array.from(files)) {
      if (next.length >= 8) {
        setError("A product can have at most 8 photos");
        break;
      }
      if (file.size > 5 * 1024 * 1024) {
        setError(`${file.name} is larger than 5 MB`);
        continue;
      }

      const form = new FormData();
      form.append("file", file);
      try {
        const { url } = await adminFetch<{ url: string }>(
          "/admin/uploads/image",
          { method: "POST", body: form },
        );
        next = [...next, url];
        onChange(next);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      }
    }

    setUploading(false);
    if (input.current) input.current.value = ""; // allow choosing the same file again
  }

  return (
    <div>
      <div className="flex flex-wrap gap-3">
        {images.map((src, i) => (
          <div key={src} className="w-28">
            <div className="relative aspect-square overflow-hidden rounded border bg-gray-100">
              <Image
                src={src}
                alt={`Photo ${i + 1}`}
                fill
                sizes="112px"
                className="object-cover"
              />
              {i === 0 && (
                <span className="absolute left-1 top-1 rounded bg-black px-1.5 text-xs text-white">
                  Main
                </span>
              )}
            </div>
            <div className="mt-1 flex justify-between text-xs">
              {i > 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    onChange([src, ...images.filter((_, j) => j !== i)])
                  }
                  className="underline"
                >
                  Make main
                </button>
              ) : (
                <span />
              )}
              <button
                type="button"
                onClick={() => onChange(images.filter((_, j) => j !== i))}
                className="text-red-600 underline"
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        onChange={(e) => handleFiles(e.target.files)}
        className="mt-3 block text-sm"
      />
      <p className="mt-1 text-xs text-gray-500">
        JPEG, PNG or WebP, up to 5 MB each, up to 8 photos. The first photo is
        the main one.
      </p>
      {uploading && <p className="mt-1 text-sm text-gray-600">Uploading...</p>}
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}
    </div>
  );
}
```

### `src/components/admin/ProductForm.tsx`

```tsx
"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import ImageUploader from "@/components/admin/ImageUploader";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminCategory, AdminProductDetail, Color } from "@/lib/api/types";
import { parseSizes } from "@/lib/sizes";

// Used for both "new product" (no product prop) and "edit product"
export default function ProductForm({
  product,
}: {
  product?: AdminProductDetail;
}) {
  const router = useRouter();
  const editing = Boolean(product);

  // Form fields (start from the product when editing)
  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? "");
  const [price, setPrice] = useState(product ? String(product.priceNgn) : "");
  const [colors, setColors] = useState<Color[]>(
    product?.colors ?? [{ name: "Black", hex: "#111111" }],
  );
  const [sizesText, setSizesText] = useState(
    product ? product.sizes.join(", ") : "38-46",
  );
  const [images, setImages] = useState<string[]>(product?.images ?? []);
  const [flags, setFlags] = useState({
    isPublished: product?.isPublished ?? true,
    isFeatured: product?.isFeatured ?? false,
    isNew: product?.isNew ?? false,
    isPopular: product?.isPopular ?? false,
    isCustomizable: product?.isCustomizable ?? true,
  });

  const [categories, setCategories] = useState<AdminCategory[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load the categories for the dropdown (and pick the first one for a new product)
  useEffect(() => {
    adminFetch<{ items: AdminCategory[] }>("/admin/categories")
      .then((d) => {
        setCategories(d.items);
        setCategoryId((current) => current || d.items[0]?.id || "");
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const sizes = parseSizes(sizesText);

  // Update one color row
  function setColor(index: number, patch: Partial<Color>) {
    setColors(colors.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  }

  // Save: create or edit
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);

    const body = {
      name,
      ...(slug ? { slug } : {}), // empty = let the server make one (new) or keep the old one (edit)
      description,
      categoryId,
      priceNgn: Number(price),
      colors,
      sizes,
      images,
      ...flags,
    };

    try {
      await adminFetch(
        editing ? `/admin/products/${product!.id}` : "/admin/products",
        {
          method: editing ? "PATCH" : "POST",
          body: JSON.stringify(body),
        },
      );
      router.push("/admin/products");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
      setSaving(false);
    }
  }

  const field = "mt-1 w-full rounded border px-3 py-2 font-normal";

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-5">
      <label className="block text-sm font-medium">
        Product name *
        <input
          required
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={field}
        />
      </label>

      <label className="block text-sm font-medium">
        Category *
        <select
          required
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          className={field}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm font-medium">
        Price per pair (₦) *
        <input
          required
          type="number"
          min={100}
          step={1}
          inputMode="numeric"
          value={price}
          onChange={(e) => setPrice(e.target.value)}
          className={field}
        />
      </label>

      <label className="block text-sm font-medium">
        Description *
        <textarea
          required
          rows={4}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          className={field}
        />
      </label>

      {/* Colors */}
      <div>
        <p className="text-sm font-medium">Colors *</p>
        <div className="mt-2 space-y-2">
          {colors.map((c, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="color"
                value={c.hex}
                onChange={(e) => setColor(i, { hex: e.target.value })}
                className="h-9 w-12 rounded border"
                aria-label={`Color ${i + 1} swatch`}
              />
              <input
                value={c.name}
                onChange={(e) => setColor(i, { name: e.target.value })}
                placeholder="Color name"
                className="rounded border px-3 py-2 text-sm"
              />
              <button
                type="button"
                disabled={colors.length === 1}
                onClick={() => setColors(colors.filter((_, j) => j !== i))}
                className="text-sm text-red-600 underline disabled:text-gray-400"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setColors([...colors, { name: "", hex: "#888888" }])}
          className="mt-2 text-sm underline"
        >
          + Add color
        </button>
      </div>

      {/* Sizes */}
      <label className="block text-sm font-medium">
        Sizes *{" "}
        <span className="font-normal text-gray-500">
          (e.g. 38-46, or 38, 40, 42)
        </span>
        <input
          value={sizesText}
          onChange={(e) => setSizesText(e.target.value)}
          className={field}
        />
        <span className="mt-1 block text-xs font-normal text-gray-600">
          {sizes.length ? `Sizes: ${sizes.join(", ")}` : "No valid sizes yet"}
        </span>
      </label>

      {/* Photos */}
      <div>
        <p className="text-sm font-medium">Photos</p>
        <div className="mt-2">
          <ImageUploader images={images} onChange={setImages} />
        </div>
      </div>

      {/* Options */}
      <fieldset className="grid grid-cols-2 gap-2 text-sm">
        {(
          [
            ["isPublished", "Visible on the shop"],
            ["isFeatured", "Featured on the home page"],
            ["isNew", "Show “New” label"],
            ["isPopular", "Popular"],
            ["isCustomizable", "Custom requests allowed"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={flags[key]}
              onChange={(e) => setFlags({ ...flags, [key]: e.target.checked })}
            />
            {label}
          </label>
        ))}
      </fieldset>

      {/* Advanced */}
      <label className="block text-sm font-medium">
        URL name (optional){" "}
        <span className="font-normal text-gray-500">
          e.g. pfc-classic-slide. Leave empty to generate it from the name.
        </span>
        <input
          value={slug}
          onChange={(e) => setSlug(e.target.value)}
          className={field}
        />
      </label>

      {error && (
        <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-700">
          {error}
        </p>
      )}

      <div className="flex gap-3">
        <button
          disabled={saving}
          className="rounded bg-black px-5 py-2 font-medium text-white disabled:bg-gray-400"
        >
          {saving ? "Saving..." : editing ? "Save changes" : "Create product"}
        </button>
        <button
          type="button"
          onClick={() => router.push("/admin/products")}
          className="rounded border px-5 py-2"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

### `src/app/admin/products/page.tsx` (replaces the placeholder)

```tsx
"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminProductSummary, Paginated } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

export default function AdminProductsPage() {
  const [data, setData] = useState<Paginated<AdminProductSummary> | null>(null);
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [error, setError] = useState<string | null>(null);

  // Load the list (also used to refresh after a change)
  const load = useCallback(async () => {
    const qs = new URLSearchParams({ page: String(page), pageSize: "20" });
    if (query) qs.set("q", query);
    try {
      setData(
        await adminFetch<Paginated<AdminProductSummary>>(
          `/admin/products?${qs.toString()}`,
        ),
      );
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load products");
    }
  }, [page, query]);

  useEffect(() => {
    load();
  }, [load]);

  // Show or hide a product on the shop
  async function togglePublished(p: AdminProductSummary) {
    try {
      await adminFetch(`/admin/products/${p.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isPublished: !p.isPublished }),
      });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not update");
    }
  }

  // Delete after confirmation
  async function remove(p: AdminProductSummary) {
    if (
      !window.confirm(
        `Delete "${p.name}"? Old orders will keep their details. This cannot be undone.`,
      )
    )
      return;
    try {
      await adminFetch(`/admin/products/${p.id}`, { method: "DELETE" });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not delete");
    }
  }

  const totalPages = data
    ? Math.max(1, Math.ceil(data.total / data.pageSize))
    : 1;

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold">Products</h1>
        <Link
          href="/admin/products/new"
          className="rounded bg-black px-4 py-2 text-sm text-white"
        >
          + New product
        </Link>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(search.trim());
          setPage(1);
        }}
        className="mt-4 flex gap-2"
      >
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name"
          className="w-64 rounded border px-3 py-1 text-sm"
        />
        <button className="rounded border px-3 py-1 text-sm">Search</button>
      </form>

      {error && <p className="mt-4 text-red-700">{error}</p>}

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="border-b text-gray-600">
            <tr>
              <th className="py-2 pr-3">Product</th>
              <th className="py-2 pr-3">Category</th>
              <th className="py-2 pr-3">Price</th>
              <th className="py-2 pr-3">Shop</th>
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {data?.items.map((p) => (
              <tr key={p.id} className="border-b align-middle">
                <td className="py-2 pr-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded bg-gray-100">
                      {p.thumbnail && (
                        <Image
                          src={p.thumbnail}
                          alt=""
                          fill
                          sizes="48px"
                          className="object-cover"
                        />
                      )}
                    </div>
                    <div>
                      <Link
                        href={`/admin/products/${p.id}`}
                        className="font-medium underline"
                      >
                        {p.name}
                      </Link>
                      <div className="text-xs text-gray-500">
                        {p.isFeatured && "Featured · "}
                        {p.isNew && "New · "}
                        {p.isPopular && "Popular"}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="py-2 pr-3">{p.category.name}</td>
                <td className="py-2 pr-3">{formatNgn(p.priceNgn)}</td>
                <td className="py-2 pr-3">
                  <button
                    onClick={() => togglePublished(p)}
                    className={`rounded-full px-3 py-0.5 text-xs ${p.isPublished ? "bg-green-100 text-green-800" : "bg-gray-200 text-gray-700"}`}
                  >
                    {p.isPublished ? "Visible" : "Hidden"}
                  </button>
                </td>
                <td className="py-2 whitespace-nowrap">
                  <Link href={`/admin/products/${p.id}`} className="underline">
                    Edit
                  </Link>
                  <button
                    onClick={() => remove(p)}
                    className="ml-3 text-red-600 underline"
                  >
                    Delete
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && data.items.length === 0 && (
          <p className="mt-3 text-gray-600">No products found.</p>
        )}
        {!data && !error && <p className="mt-3 text-gray-600">Loading...</p>}
      </div>

      {data && totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-4 text-sm">
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

### `src/app/admin/products/new/page.tsx` (new)

```bash
mkdir -p "src/app/admin/products/new"
```

```tsx
import ProductForm from "@/components/admin/ProductForm";

// Empty form for a new product
export default function NewProductPage() {
  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">New product</h1>
      <ProductForm />
    </div>
  );
}
```

### `src/app/admin/products/[id]/page.tsx` (new)

```bash
mkdir -p "src/app/admin/products/[id]"
```

```tsx
"use client";

import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import ProductForm from "@/components/admin/ProductForm";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminProductDetail } from "@/lib/api/types";

// Loads one product, then shows the form filled in
export default function EditProductPage() {
  const { id } = useParams<{ id: string }>();
  const [product, setProduct] = useState<AdminProductDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    adminFetch<AdminProductDetail>(`/admin/products/${id}`)
      .then(setProduct)
      .catch((e: Error) => setError(e.message));
  }, [id]);

  if (error) return <p className="text-red-700">{error}</p>;
  if (!product) return <p className="text-gray-600">Loading...</p>;

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Edit product</h1>
      <ProductForm product={product} />
    </div>
  );
}
```

### `src/app/admin/categories/page.tsx` (replaces the placeholder)

```tsx
"use client";

import { useCallback, useEffect, useState } from "react";
import { adminFetch } from "@/lib/api/adminClient";
import type { AdminCategory } from "@/lib/api/types";

export default function AdminCategoriesPage() {
  const [items, setItems] = useState<AdminCategory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // The form: editingId is null when adding a new category
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isActive, setIsActive] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const d = await adminFetch<{ items: AdminCategory[] }>(
        "/admin/categories",
      );
      setItems(d.items);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load categories");
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Reset the form to "add new"
  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setSortOrder("0");
    setIsActive(true);
  }

  // Fill the form with a category to edit it
  function startEdit(c: AdminCategory) {
    setEditingId(c.id);
    setName(c.name);
    setDescription(c.description ?? "");
    setSortOrder(String(c.sortOrder));
    setIsActive(c.isActive);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Create or save
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await adminFetch(
        editingId ? `/admin/categories/${editingId}` : "/admin/categories",
        {
          method: editingId ? "PATCH" : "POST",
          body: JSON.stringify({
            name,
            description: description || null,
            sortOrder: Number(sortOrder) || 0,
            isActive,
          }),
        },
      );
      resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save");
    } finally {
      setSaving(false);
    }
  }

  // Delete (the server refuses if the category still has products)
  async function remove(c: AdminCategory) {
    if (!window.confirm(`Delete the category "${c.name}"?`)) return;
    setError(null);
    try {
      await adminFetch(`/admin/categories/${c.id}`, { method: "DELETE" });
      if (editingId === c.id) resetForm();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not delete");
    }
  }

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold">Categories</h1>

      {/* Add / edit form */}
      <form
        onSubmit={handleSubmit}
        className="mt-4 space-y-3 rounded-lg border p-4"
      >
        <h2 className="font-semibold">
          {editingId ? "Edit category" : "Add a category"}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">
            Name *
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 font-normal"
            />
          </label>
          <label className="text-sm font-medium">
            Order on the site (0 = first)
            <input
              type="number"
              min={0}
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              className="mt-1 w-full rounded border px-3 py-2 font-normal"
            />
          </label>
        </div>
        <label className="block text-sm font-medium">
          Description
          <input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isActive}
            onChange={(e) => setIsActive(e.target.checked)}
          />
          Visible on the shop
        </label>
        <div className="flex gap-3">
          <button
            disabled={saving}
            className="rounded bg-black px-4 py-2 text-sm text-white disabled:bg-gray-400"
          >
            {saving ? "Saving..." : editingId ? "Save changes" : "Add category"}
          </button>
          {editingId && (
            <button
              type="button"
              onClick={resetForm}
              className="rounded border px-4 py-2 text-sm"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      {error && (
        <p
          role="alert"
          className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700"
        >
          {error}
        </p>
      )}

      {/* List */}
      <div className="mt-6 space-y-2">
        {items?.map((c) => (
          <div
            key={c.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm"
          >
            <div>
              <p className="font-medium">
                {c.name}{" "}
                {!c.isActive && (
                  <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs">
                    Hidden
                  </span>
                )}
              </p>
              <p className="text-gray-600">
                /{c.slug} · {c.productCount} product
                {c.productCount === 1 ? "" : "s"} · order {c.sortOrder}
              </p>
            </div>
            <div>
              <button onClick={() => startEdit(c)} className="underline">
                Edit
              </button>
              <button
                onClick={() => remove(c)}
                className="ml-3 text-red-600 underline"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
        {items && items.length === 0 && (
          <p className="text-gray-600">No categories yet.</p>
        )}
        {!items && !error && <p className="text-gray-600">Loading...</p>}
      </div>
    </div>
  );
}
```

### Test locally

1. **Categories**: add one ("Boots"), edit it, hide it, then try deleting "Slides" (it has products): you get the "still has products" message. Delete "Boots".
2. **New product**: fill in everything, add 2 photos (they should appear and show "Main" on the first), save. It appears in `/admin/products`.
3. Open the public shop (`/shop`): the new product is there with its photos. Hide it in admin ("Visible" → "Hidden"): it disappears from the shop.
4. **Edit** a seeded product: replace its placeholder photos with real ones, change the price, save, and check the product page.
5. **Bad uploads**: try a `.pdf` or a renamed `.txt` file (rejected with "Only JPEG, PNG or WebP") and an image over 5 MB (rejected with a size message).
6. **Delete** a product that has an order: the order page and admin order detail still show the product name.

```bash
cd ..
git add . && git commit -m "feat(frontend): admin products, categories and photo upload"
git push -u origin feat/admin-catalog
git checkout develop && git merge --no-ff feat/admin-catalog && git push
```

## 2.3 Release

1. On **Render → Environment** add `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` (Render redeploys).
2. Merge and push:

```bash
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

3. On `https://pfc-shop.vercel.app/admin` repeat test steps 1 to 4, with a photo taken on your phone.

---

## Done when

- [ ] The dashboard shows live numbers and links to the orders list
- [ ] Orders can be filtered and searched, opened, and moved through the statuses
- [ ] The WhatsApp, call and email buttons on an order work
- [ ] A product can be created with photos, edited, hidden and deleted, and the public shop reflects it at once
- [ ] Categories can be added, edited, hidden and deleted (blocked while they have products)
- [ ] A non-admin gets 403 on `/api/v1/admin/*`, and uploads reject non-images and files over 5 MB
- [ ] Phase 8 ticked in `agent.md` + Progress Log row

## Troubleshooting

- **A page 404s at `/admin/orders/<id>` or `/admin/products/<id>`** → the folder must be named `[id]` with brackets (see the note at the top).
- **`UPLOADS_UNAVAILABLE` (503)** → the three Cloudinary variables are empty in that environment.
- **`UPLOAD_FAILED` (502)** → read the `[upload]` line in the backend logs; usually a wrong API key or secret.
- **`Invalid src prop ... hostname is not configured`** → the image host is missing from `images.remotePatterns` in `next.config.ts` (only `res.cloudinary.com` and `placehold.co` are allowed). Restart `npm run dev` after editing it.
- **`403` on admin pages for your own account** → your email isn't in `ADMIN_EMAILS` on Render, or you need to sign out and in again after adding it.
- **Saving a product says "Use a hex color"** → a color row has an invalid value; use the color picker.
- **Product edits don't show on the shop** → the shop pages fetch fresh data on every request, so hard refresh; if still old, check you edited the right (live vs local) environment.

## Later ideas (not needed now)

- Email the customer automatically when you mark an order Confirmed or Completed (reuse `sendEmail()`).
- Delete old Cloudinary images when a product's photo is removed.
- Product reordering and stock levels.

## Next: Phase 7 — Customer accounts

A "My orders" page for signed-in customers (history, status, pay-again link), name and phone prefilled at checkout, and linking earlier guest orders to an account by matching email.
