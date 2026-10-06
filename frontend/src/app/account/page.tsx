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
