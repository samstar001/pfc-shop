import { escapeHtml } from "../utils/html.js";
import {
  emailShell,
  itemsHtml,
  itemsText,
  totalLine,
  type OrderWithItems,
} from "./layout.js";

// Email sent to the customer after they place an order
export function buildOrderConfirmationEmail(
  order: OrderWithItems,
  orderUrl: string,
  whatsappUrl: string | null,
) {
  const subject = `Your PFC order ${order.reference} has been received`;
  const firstName = order.customerName.split(" ")[0];

  // HTML version
  const html = emailShell(
    `Thank you, ${firstName}!`,
    `
    <p style="font-size:14px;line-height:1.5">We have received your order <strong>${escapeHtml(order.reference)}</strong>.</p>
    ${itemsHtml(order)}
    <p style="font-size:15px;font-weight:bold;text-align:right">${escapeHtml(totalLine(order))}</p>
    <p style="font-size:14px;line-height:1.5;background:#fff8e1;padding:12px;border-radius:6px">
      PFC will contact you to confirm availability, the delivery fee and payment.
    </p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(orderUrl)}" style="background:#111;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your order</a>
      ${
        whatsappUrl
          ? `<a href="${escapeHtml(whatsappUrl)}" style="margin-left:8px;background:#16a34a;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">Chat on WhatsApp</a>`
          : ""
      }
    </p>`,
  );

  // Plain-text version
  const text = [
    `Thank you, ${firstName}!`,
    `We have received your order ${order.reference}.`,
    "",
    itemsText(order),
    "",
    `Total: ${totalLine(order)}`,
    "PFC will contact you to confirm availability, the delivery fee and payment.",
    "",
    `View your order: ${orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}
