"use client";

import Link from "next/link";
import { useMounted } from "@/hooks/useMounted";
import { cartQuantity, useCart } from "@/lib/cart/store";

// Header link showing how many pairs are in the cart
export default function CartLink() {
  const mounted = useMounted();
  const count = useCart((s) => cartQuantity(s.items));

  return (
    <Link href="/cart" className="text-sm text-gray-700 hover:text-black">
      Cart{mounted && count > 0 ? ` (${count})` : ""}
    </Link>
  );
}
