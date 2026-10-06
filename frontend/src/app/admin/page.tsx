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
