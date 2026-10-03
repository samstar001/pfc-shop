"use client";

import Link from "next/link";
import { useState } from "react";
import type { ProductDetail } from "@/lib/api/types";
import { cartQuantity, useCart } from "@/lib/cart/store";
import { formatNgn } from "@/lib/format";

// Color + size-by-size quantity picker with a running total and an Add to cart button
export default function ProductConfigurator({
  product,
}: {
  product: ProductDetail;
}) {
  const addItem = useCart((s) => s.addItem);

  const [color, setColor] = useState(product.colors[0]?.name ?? "");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [added, setAdded] = useState(false);

  // Running total of pairs and price
  const total = Object.values(qty).reduce((a, b) => a + b, 0);
  const amount = total * product.priceNgn;

  // Set one size's quantity (clamped to 0–1000)
  function setSize(size: number, value: number) {
    const clean = Math.max(0, Math.min(1000, Math.floor(value) || 0));
    setQty((q) => ({ ...q, [String(size)]: clean }));
    setAdded(false);
  }

  // Put the chosen sizes in the cart
  function handleAdd() {
    const sizeBreakdown = Object.fromEntries(
      Object.entries(qty).filter(([, n]) => n > 0),
    );
    addItem({
      productId: product.id,
      slug: product.slug,
      name: product.name,
      image: product.thumbnail,
      color,
      sizeBreakdown,
      unitPriceNgn: product.priceNgn,
    });
    setQty({});
    setAdded(true);
  }

  return (
    <div className="mt-6">
      {/* Color choice */}
      <h2 className="font-medium">Color</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {product.colors.map((c) => (
          <button
            key={c.name}
            type="button"
            onClick={() => setColor(c.name)}
            aria-pressed={color === c.name}
            className={`flex items-center gap-2 rounded-full border px-3 py-1 text-sm ${
              color === c.name
                ? "border-black bg-black text-white"
                : "hover:bg-gray-50"
            }`}
          >
            <span
              className="h-3 w-3 rounded-full border border-gray-300"
              style={{ backgroundColor: c.hex }}
            />
            {c.name}
          </button>
        ))}
      </div>

      {/* Quantity per size */}
      <h2 className="mt-6 font-medium">Sizes and quantity (pairs)</h2>
      <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-4">
        {product.sizes.map((s) => (
          <label key={s} className="flex flex-col rounded border p-2 text-sm">
            <span className="font-medium">Size {s}</span>
            <input
              type="number"
              inputMode="numeric"
              min={0}
              max={1000}
              value={qty[String(s)] ?? 0}
              onChange={(e) => setSize(s, Number(e.target.value))}
              className="mt-1 w-full rounded border px-2 py-1"
              aria-label={`Quantity for size ${s}`}
            />
          </label>
        ))}
      </div>

      {/* Running total */}
      <p className="mt-4 text-sm text-gray-700">
        Total: <strong>{total}</strong> pair{total === 1 ? "" : "s"} ·{" "}
        <strong>{formatNgn(amount)}</strong>
      </p>

      <button
        type="button"
        onClick={handleAdd}
        disabled={total === 0}
        className="mt-4 w-full rounded bg-black px-5 py-3 font-medium text-white disabled:cursor-not-allowed disabled:bg-gray-300 disabled:text-gray-600"
      >
        {total === 0 ? "Choose sizes to add to cart" : "Add to cart"}
      </button>

      {/* Confirmation after adding */}
      {added && (
        <p className="mt-3 text-sm text-green-700">
          Added to your cart.{" "}
          <Link href="/cart" className="underline">
            View cart
          </Link>{" "}
          or keep shopping.
        </p>
      )}
    </div>
  );
}
