import { create } from "zustand";
import { persist } from "zustand/middleware";

// One cart line = one product in one color, with a quantity per size
export type CartItem = {
  key: string; // `${productId}:${color}`
  productId: string;
  slug: string;
  name: string;
  image: string | null;
  color: string;
  sizeBreakdown: Record<string, number>; // { "40": 3, "41": 5 }
  unitPriceNgn: number; // for DISPLAY only — the server recalculates the real price
};

type CartState = {
  items: CartItem[];
  addItem: (item: Omit<CartItem, "key">) => void;
  setSizeQty: (key: string, size: string, qty: number) => void;
  removeItem: (key: string) => void;
  clear: () => void;
};

// Total pairs in one line / in the whole cart, and the display subtotal
export const itemQuantity = (i: CartItem) =>
  Object.values(i.sizeBreakdown).reduce((a, b) => a + b, 0);
export const cartQuantity = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + itemQuantity(i), 0);
export const cartSubtotal = (items: CartItem[]) =>
  items.reduce((sum, i) => sum + itemQuantity(i) * i.unitPriceNgn, 0);

export const useCart = create<CartState>()(
  persist(
    (set) => ({
      items: [],

      // Add a line; if the same product + color is already in the cart, merge the size quantities
      addItem: (item) =>
        set((state) => {
          const key = `${item.productId}:${item.color}`;
          const existing = state.items.find((i) => i.key === key);
          if (!existing) return { items: [...state.items, { ...item, key }] };

          const merged = { ...existing.sizeBreakdown };
          for (const [size, qty] of Object.entries(item.sizeBreakdown))
            merged[size] = (merged[size] ?? 0) + qty;
          return {
            items: state.items.map((i) =>
              i.key === key ? { ...i, sizeBreakdown: merged } : i,
            ),
          };
        }),

      // Change one size's quantity (0 removes that size; a line with no sizes left is removed)
      setSizeQty: (key, size, qty) =>
        set((state) => ({
          items: state.items
            .map((i) => {
              if (i.key !== key) return i;
              const next = { ...i.sizeBreakdown };
              if (qty <= 0) delete next[size];
              else next[size] = qty;
              return { ...i, sizeBreakdown: next };
            })
            .filter((i) => itemQuantity(i) > 0),
        })),

      removeItem: (key) =>
        set((state) => ({ items: state.items.filter((i) => i.key !== key) })),
      clear: () => set({ items: [] }),
    }),
    { name: "pfc-cart" }, // localStorage key
  ),
);
