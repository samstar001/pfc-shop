import { escapeHtml } from "../utils/html.js";
import {
  designHtml,
  designText,
  emailShell,
  itemsHtml,
  itemsText,
  type OrderWithItems,
} from "./layout.js";

// Email sent to PFC when a custom design request arrives
export function buildAdminNewQuoteEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `Custom design request ${order.reference} · ${order.totalQuantity} pairs`;

  // Customer details block (customer text is escaped)
  const detailRows: [string, string | null][] = [
    ["Name", order.customerName],
    ["Phone", order.customerPhone],
    ["Email", order.customerEmail],
    ["Location", order.location],
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
    `Custom design request ${order.reference}`,
    `
    <table role="presentation" cellspacing="0" cellpadding="0">${details}</table>
    ${designHtml(order)}
    ${itemsHtml(order)}
    ${order.instructions ? `<p style="font-size:14px;line-height:1.5"><strong>Description:</strong><br>${escapeHtml(order.instructions)}</p>` : ""}
    <p style="font-size:14px;color:#666">This is a quote request. Reply to the customer with a price.</p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#6d4e37;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open request</a></p>`,
  );

  // Plain-text version
  const text = [
    `Custom design request ${order.reference}`,
    `Name: ${order.customerName}`,
    `Phone: ${order.customerPhone}`,
    order.customerEmail ? `Email: ${order.customerEmail}` : "",
    order.location ? `Location: ${order.location}` : "",
    "",
    designText(order),
    itemsText(order),
    order.instructions ? `\nDescription: ${order.instructions}` : "",
    "",
    "This is a quote request. Reply to the customer with a price.",
    `Open request: ${orderUrl}`,
  ]
    .filter((l, i, arr) => l !== "" || arr[i - 1] !== "")
    .join("\n");

  return { subject, html, text };
}
