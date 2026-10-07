"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import type { OrderDetail } from "@/lib/api/types";
import { formatNgn } from "@/lib/format";
import PayButton from "./PayButton";
import { useAuth } from "@/lib/auth/AuthProvider";
import { customerStatusLabel } from "@/lib/orderStatus";
import Image from "next/image";

// Loads an order by reference (+ token for guests) and shows its details
export default function OrderView() {
  const { reference } = useParams<{ reference: string }>();
  const token = useSearchParams().get("token");

  // 1. Hook placed inside the component next to the others
  const { user } = useAuth();

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
        Your {order.type === "CUSTOM" ? "custom design request" : "order"}{" "}
        <strong>{order.reference}</strong> has been received.
      </p>

      {/* Status */}
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {/* 2. Replaced the default status wrapper with customerStatusLabel formatting */}
        <span className="rounded-full bg-gray-100 px-3 py-1 text-gray-800">
          Status: {customerStatusLabel(order.status)}
        </span>
        <span className="rounded-full bg-gray-600 px-3 py-1 text-white">
          {order.paymentStatus !== "NOT_APPLICABLE" && (
            <span className="rounded-full bg-gray-100 px-3 py-1">
              Payment: {order.paymentStatus.replaceAll("_", " ")}
            </span>
          )}
        </span>
      </div>

      {/* Payment state */}
      {order.paymentStatus === "PAID" ? (
        <p className="mt-3 rounded bg-green-50 p-3 text-sm text-green-900">
          Payment received. Thank you! PFC will contact you about delivery and
          the delivery fee.
        </p>
      ) : order.type === "CATALOGUE" && order.subtotalNgn != null ? (
        <div className="mt-3 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
          <p>
            {order.paymentStatus === "FAILED"
              ? "Your last payment attempt did not go through. You can try again."
              : "Your order is saved. Pay now to confirm it, or PFC will contact you."}
          </p>
          <p className="mt-1 text-xs">
            Payment covers the items. The delivery fee is confirmed separately
            by PFC.
          </p>
        </div>
      ) : order.type === "CUSTOM" ? (
        <p className="mt-3 rounded bg-yellow-50 p-3 text-sm text-yellow-900">
          PFC will review your design and contact you with a price. You do not
          need to pay anything now.
        </p>
      ) : null}

      {/* 3. Guests wrapper added directly following the payment message module */}
      {!user && order.customerEmail && (
        <p className="mt-4 rounded bg-gray-50 p-3 text-sm text-gray-700">
          Want to see all your orders in one place?{" "}
          <a
            href={`/api/v1/auth/google/login?next=/account`}
            className="font-medium underline text-brand"
          >
            Sign in with Google
          </a>{" "}
          using <strong>{order.customerEmail}</strong> and this order will be
          added to your account.
        </p>
      )}

      {/* Items */}
      <div className="mt-6 space-y-3">
        {order.items.map((i) => (
          <div key={i.id} className="panel p-4 text-sm">
            <p className="font-medium">
              {i.productName}
              {i.color ? ` · ${i.color}` : ""}
            </p>
            <p className="text-gray-600">
              {Object.entries(i.sizeBreakdown)
                .map(([s, n]) => `Size ${s}: ${n}`)
                .join(" · ")}
            </p>
            {i.colorNote && (
              <p className="text-gray-600">Colour: {i.colorNote}</p>
            )}
            {i.designImageUrl && (
              <Image
                src={i.designImageUrl}
                alt="Your design"
                width={240}
                height={240}
                className="my-2 h-48 w-auto rounded-lg border object-contain"
              />
            )}
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
      <div className="mt-8 flex flex-wrap items-start gap-3">
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
        <Link href="/shop" className="btn-secondary">
          Continue shopping
        </Link>
      </div>
    </div>
  );
}
