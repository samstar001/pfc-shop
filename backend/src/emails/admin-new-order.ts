import { escapeHtml } from "../utils/html.js";
import {
  emailShell,
  itemsHtml,
  itemsText,
  totalLine,
  type OrderWithItems,
} from "./layout.js";

// Email sent to PFC when a new order arrives
export function buildAdminNewOrderEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `New order ${order.reference} · ${totalLine(order)}`;

  // Customer details block (customer text is escaped)
  const detailRows: [string, string | null][] = [
    ["Name", order.customerName],
    ["Phone", order.customerPhone],
    ["Email", order.customerEmail],
    ["Location", order.location],
    ["Notes", order.instructions],
  ];
  const details = detailRows
    .filter(([, v]) => v)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#666;font-size:14px">${k}</td><td style="font-size:14px">${escapeHtml(v!)}</td></tr>`,
    )
    .join("");

  // HTML version
  const html = emailShell(
    `New order ${order.reference}`,
    `
    <table role="presentation" cellspacing="0" cellpadding="0">${details}</table>
    <div style="height:16px"></div>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open order</a></p>`,
  );

  // Plain-text version
  const text = [
    `New order ${order.reference}`,
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    order.customerEmail ? `Email: ${order.customerEmail}` : "",
    order.location ? `Location: ${order.location}` : "",
    order.instructions ? `Notes: ${order.instructions}` : "",
    "",
    itemsText(order),
    "",
    `Total: ${totalLine(order)}`,
    `Open order: ${orderUrl}`,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
