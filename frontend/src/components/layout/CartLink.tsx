"use client";

import Link from "next/link";
import { useMounted } from "@/hooks/useMounted";
import { cartQuantity, useCart } from "@/lib/cart/store";

// Header link: a bag icon with the number of pairs in the cart
export default function CartLink() {
  const mounted = useMounted();
  const count = useCart((s) => cartQuantity(s.items));
  const shown = mounted ? count : 0;

  return (
    <Link
      href="/cart"
      aria-label={shown > 0 ? `Cart, ${shown} items` : "Cart"}
      className="relative inline-flex h-10 w-10 items-center justify-center rounded-lg hover:bg-page"
    >
      {/* Bag icon */}
      <svg
        viewBox="0 0 24 24"
        className="h-6 w-6"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        aria-hidden="true"
      >
        <path d="M6 8h12l-1 12H7L6 8Z" strokeLinejoin="round" />
        <path d="M9 8V6a3 3 0 0 1 6 0v2" strokeLinecap="round" />
      </svg>
      {/* Item count */}
      {shown > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-xs font-semibold text-white">
          {shown}
        </span>
      )}
    </Link>
  );
}
