"use client";

import Image from "next/image";
import Link from "next/link";
import { useMounted } from "@/hooks/useMounted";
import {
  cartQuantity,
  cartSubtotal,
  itemQuantity,
  useCart,
} from "@/lib/cart/store";
import { formatNgn } from "@/lib/format";

export default function CartPage() {
  const mounted = useMounted();
  const { items, setSizeQty, removeItem } = useCart();

  // Wait for the browser to load the saved cart
  if (!mounted) return <p className="text-gray-600">Loading your cart...</p>;

  // Empty state
  if (items.length === 0) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Your cart</h1>
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
    <div>
      <h1 className="text-2xl font-bold">Your cart</h1>

      {/* One card per product + color */}
      <div className="mt-6 space-y-4">
        {items.map((item) => (
          <div key={item.key} className="flex gap-4 rounded-lg border p-4">
            <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded bg-gray-100">
              {item.image && (
                <Image
                  src={item.image}
                  alt={item.name}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              )}
            </div>

            <div className="flex-1">
              <Link
                href={`/product/${item.slug}`}
                className="font-medium hover:underline"
              >
                {item.name}
              </Link>
              <p className="text-sm text-gray-600">
                {item.color} · {formatNgn(item.unitPriceNgn)} per pair
              </p>

              {/* Editable quantity per size */}
              <div className="mt-2 flex flex-wrap gap-2">
                {Object.entries(item.sizeBreakdown).map(([size, n]) => (
                  <label
                    key={size}
                    className="flex items-center gap-1 rounded border px-2 py-1 text-sm"
                  >
                    Size {size}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      value={n}
                      onChange={(e) =>
                        setSizeQty(
                          item.key,
                          size,
                          Math.max(0, Math.floor(Number(e.target.value)) || 0),
                        )
                      }
                      className="w-14 rounded border px-1"
                      aria-label={`Quantity for size ${size}`}
                    />
                  </label>
                ))}
              </div>

              <div className="mt-2 flex items-center justify-between text-sm">
                <span>
                  {itemQuantity(item)} pairs ·{" "}
                  <strong>
                    {formatNgn(itemQuantity(item) * item.unitPriceNgn)}
                  </strong>
                </span>
                <button
                  type="button"
                  onClick={() => removeItem(item.key)}
                  className="text-red-600 hover:underline"
                >
                  Remove
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Totals and checkout button */}
      <div className="mt-6 flex flex-col items-end gap-2">
        <p>
          {cartQuantity(items)} pairs · Subtotal{" "}
          <strong>{formatNgn(cartSubtotal(items))}</strong>
        </p>
        <p className="text-xs text-gray-500">
          Delivery fee is confirmed by PFC after you place the order.
        </p>
        <Link
          href="/checkout"
          className="rounded bg-black px-6 py-3 font-medium text-white"
        >
          Proceed to checkout
        </Link>
      </div>
    </div>
  );
}
