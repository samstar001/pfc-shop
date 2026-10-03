import type { Prisma } from "@prisma/client";
import { env } from "../config/env.js";

type OrderWithItems = Prisma.OrderGetPayload<{ include: { items: true } }>;

// Plain-text order message customers can send to PFC on WhatsApp
export function buildWhatsappMessage(order: OrderWithItems): string {
  const lines: string[] = [`Hello PFC, I placed order ${order.reference}.`];

  // One block per item: product, color, then each size with its quantity
  for (const item of order.items) {
    lines.push(
      "",
      `Product: ${item.productNameSnapshot}${item.color ? ` | ${item.color}` : ""}`,
    );
    const sizes = item.sizeBreakdown as Record<string, number>;
    for (const [size, qty] of Object.entries(sizes)) {
      lines.push(`Size ${size}: ${qty} pair${qty === 1 ? "" : "s"}`);
    }
  }

  // Totals and customer details
  lines.push("", `Total: ${order.totalQuantity} pairs`);
  if (order.subtotalNgn != null)
    lines.push(`Amount: ₦${order.subtotalNgn.toLocaleString("en-NG")}`);
  if (order.instructions) lines.push(`Notes: ${order.instructions}`);
  lines.push("", `Name: ${order.customerName} | Phone: ${order.customerPhone}`);
  if (order.location) lines.push(`Location: ${order.location}`);

  return lines.join("\n");
}

// wa.me link with the message pre-filled; null if no PFC number is configured
export function buildWhatsappUrl(order: OrderWithItems): string | null {
  const number = env.PFC_WHATSAPP_NUMBER.replace(/\D/g, "");
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(buildWhatsappMessage(order))}`;
}
