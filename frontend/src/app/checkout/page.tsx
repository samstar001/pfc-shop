"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useMounted } from "@/hooks/useMounted";
import { useAuth } from "@/lib/auth/AuthProvider";
import {
  cartQuantity,
  cartSubtotal,
  itemQuantity,
  useCart,
} from "@/lib/cart/store";
import { formatNgn } from "@/lib/format";
import type { OrderDetail } from "@/lib/api/types";

export default function CheckoutPage() {
  const router = useRouter();
  const mounted = useMounted();
  const { user } = useAuth();
  const { items, clear } = useCart();

  // Form fields
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [location, setLocation] = useState("");
  const [instructions, setInstructions] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If the customer is signed in with Google, prefill name and email (without overwriting what they typed)
  useEffect(() => {
    if (!user) return;
    setName((n) => n || user.name);
    setEmail((e) => e || user.email);
  }, [user]);

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

  // Send the order to the API
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/v1/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "CATALOGUE",
          customer: { name, phone, email, location },
          // Only ids, colors and quantities are sent; the server works out prices itself
          items: items.map((i) => ({
            productId: i.productId,
            color: i.color,
            sizeBreakdown: i.sizeBreakdown,
          })),
          instructions,
        }),
      });
      const data = await res.json();

      if (!res.ok) {
        // Show the first field-level message if there is one, otherwise the general message
        const detail = data?.error?.details?.[0];
        setError(
          detail
            ? `${detail.issue}`
            : (data?.error?.message ?? "Something went wrong"),
        );
        return;
      }

      // Success: empty the cart and go to the confirmation page (the token lets guests view their order)
      const order = data as OrderDetail & { accessToken: string };
      clear();
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

  if (!mounted) return <p className="text-gray-600">Loading...</p>;

  // Nothing to check out
  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Checkout</h1>
        <p className="mt-4 text-gray-600">Your cart is empty.</p>
        <Link
          href="/shop"
          className="mt-4 inline-block rounded bg-black px-5 py-3 text-white"
        >
          Browse the collection
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-8 md:grid-cols-2">
      {/* Customer details form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        <h1 className="text-2xl font-bold">Checkout</h1>

        {/* Optional Google sign-in (full page navigation, so a normal link is used) */}
        {!user && (
          <p className="rounded bg-gray-50 p-3 text-sm text-gray-700">
            Have a Google account?{" "}
            <a
              href="/api/v1/auth/google/login?next=/checkout"
              className="font-medium underline"
            >
              Continue with Google
            </a>{" "}
            to fill in your details and keep track of your orders. Or just fill
            in the form below.
          </p>
        )}

        <label className="block text-sm font-medium">
          Full name *
          <input
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
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
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Email * (for payment and your confirmation)
          <input
            required
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Delivery location
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="City / area"
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        <label className="block text-sm font-medium">
          Additional instructions
          <textarea
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            rows={3}
            className="mt-1 w-full rounded border px-3 py-2 font-normal"
          />
        </label>

        {error && (
          <p
            role="alert"
            className="rounded bg-red-50 p-3 text-sm text-red-700"
          >
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded bg-black px-5 py-3 font-medium text-white disabled:bg-gray-400"
        >
          {submitting ? "Placing order..." : "Place order"}
        </button>
      </form>

      {/* Order summary */}
      <aside className="h-fit rounded-lg border p-4">
        <h2 className="font-semibold">Order summary</h2>
        <div className="mt-3 space-y-3 text-sm">
          {items.map((i) => (
            <div key={i.key} className="border-b pb-3">
              <p className="font-medium">
                {i.name} · {i.color}
              </p>
              <p className="text-gray-600">
                {Object.entries(i.sizeBreakdown)
                  .map(([s, n]) => `Size ${s}: ${n}`)
                  .join(" · ")}
              </p>
              <p>
                {itemQuantity(i)} pairs ·{" "}
                {formatNgn(itemQuantity(i) * i.unitPriceNgn)}
              </p>
            </div>
          ))}
        </div>
        <p className="mt-3 flex justify-between font-semibold">
          <span>{cartQuantity(items)} pairs</span>
          <span>{formatNgn(cartSubtotal(items))}</span>
        </p>
        <p className="mt-1 text-xs text-gray-500">
          Delivery fee is confirmed by PFC after you place the order.
        </p>
        <Link href="/cart" className="mt-3 inline-block text-sm underline">
          Edit cart
        </Link>
      </aside>
    </div>
  );
}
