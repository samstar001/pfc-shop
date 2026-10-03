"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrderDetail } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";

// Loads an order by reference (+ token for guests) and shows its details
export default function OrderView() {
  const { reference } = useParams<{ reference: string }>();
  const token = useSearchParams().get("token");

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing">(
    "loading",
  );

  // Fetch the order through the /api rewrite (the session cookie is sent automatically)
  useEffect(() => {
    const qs = token ? `?token=${encodeURIComponent(token)}` : "";
    fetch(`/api/v1/orders/${encodeURIComponent(reference)}${qs}`, {
      cache: "no-store",
    })
      .then(async (res) => {
        if (!res.ok) return setState("missing");
        setOrder(await res.json());
        setState("ready");
      })
      .catch(() => setState("missing"));
  }, [reference, token]);

  if (state === "loading")
    return <p className="text-gray-600">Loading your order...</p>;

  if (state === "missing" || !order) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Order not found</h1>
        <p className="mt-2 text-gray-600">
          This link may be incomplete or expired. If you just placed an order,
          sign in with the account you used or contact us.
        </p>
        <Link href="/shop" className="mt-4 inline-block underline">
          Back to shop
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">
        Thank you, {order.customerName.split(" ")[0]}!
      </h1>
      <p className="mt-2 text-gray-700">
        Your order <strong>{order.reference}</strong> has been received.
      </p>

      {/* Status */}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <span className="rounded-full bg-gray-600 px-3 py-1">
          Status: {order.status.replaceAll("_", " ")}
        </span>
        <span className="rounded-full bg-gray-600 px-3 py-1">
          Payment: {order.paymentStatus.replaceAll("_", " ")}
        </span>
      </div>
      <p className="mt-3 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
        Online payment is coming soon. PFC will contact you to confirm your
        order, the delivery fee and payment.
      </p>

      {/* Items */}
      <div className="mt-6 space-y-3">
        {order.items.map((i) => (
          <div key={i.id} className="rounded-lg border p-4 text-sm">
            <p className="font-medium">
              {i.productName}
              {i.color ? ` · ${i.color}` : ""}
            </p>
            <p className="text-gray-600">
              {Object.entries(i.sizeBreakdown)
                .map(([s, n]) => `Size ${s}: ${n}`)
                .join(" · ")}
            </p>
            <p>
              {i.quantity} pairs
              {i.unitPriceNgn != null
                ? ` · ${formatNgn(i.quantity * i.unitPriceNgn)}`
                : ""}
            </p>
          </div>
        ))}
      </div>

      <p className="mt-4 flex justify-between font-semibold">
        <span>{order.totalQuantity} pairs</span>
        {order.subtotalNgn != null && (
          <span>{formatNgn(order.subtotalNgn)}</span>
        )}
      </p>

      {/* Customer details */}
      <div className="mt-6 text-sm text-gray-700">
        <p>Phone: {order.customerPhone}</p>
        {order.customerEmail && <p>Email: {order.customerEmail}</p>}
        {order.location && <p>Location: {order.location}</p>}
        {order.instructions && <p>Notes: {order.instructions}</p>}
      </div>

      {/* Actions */}
      <div className="mt-8 flex flex-wrap gap-3">
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
    </div>
  );
}
