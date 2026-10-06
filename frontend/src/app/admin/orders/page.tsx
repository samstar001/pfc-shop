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
