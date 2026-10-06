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
          className="rounded bg-brand px-4 py-1 text-sm text-white disabled:bg-gray-300"
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
