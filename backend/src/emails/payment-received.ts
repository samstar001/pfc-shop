import { escapeHtml } from "../utils/html.js";
import {
  emailShell,
  itemsHtml,
  itemsText,
  totalLine,
  type OrderWithItems,
} from "./layout.js";

// Receipt sent to the customer after a successful payment
export function buildPaymentReceiptEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `Payment received for order ${order.reference}`;
  const firstName = order.customerName.split(" ")[0];

  const html = emailShell(
    `Payment received, thank you ${firstName}!`,
    `
    <p style="font-size:14px;line-height:1.5">We have received your payment for order <strong>${escapeHtml(order.reference)}</strong>.</p>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="font-size:14px;line-height:1.5;background:#ecfdf5;padding:12px;border-radius:6px">
      This payment covers your items. PFC will contact you about delivery and the delivery fee.
    </p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your order</a></p>`,
  );

  const text = [
    `Payment received, thank you ${firstName}!`,
    `We have received your payment for order ${order.reference}.`,
    "",
    itemsText(order),
    "",
    `Total paid: ${totalLine(order)}`,
    "This payment covers your items. PFC will contact you about delivery and the delivery fee.",
    "",
    `View your order: ${orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}

// Notice sent to PFC when an order has been paid
export function buildAdminPaymentEmail(
  order: OrderWithItems,
  orderUrl: string,
) {
  const subject = `PAID: order ${order.reference} · ${totalLine(order)}`;

  const html = emailShell(
    `Payment received: ${order.reference}`,
    `
    <p style="font-size:14px;line-height:1.5">
      <strong>${escapeHtml(order.customerName)}</strong> paid for this order.<br>
      Phone: ${escapeHtml(order.customerPhone)}${order.location ? `<br>Location: ${escapeHtml(order.location)}` : ""}
    </p>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="margin:24px 0"><a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Open order</a></p>`,
  );

  const text = [
    `PAID: order ${order.reference}`,
    `Customer: ${order.customerName} (${order.customerPhone})`,
    order.location ? `Location: ${order.location}` : "",
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
