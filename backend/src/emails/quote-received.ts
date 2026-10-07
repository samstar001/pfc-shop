import { escapeHtml } from "../utils/html.js";
import {
  designHtml,
  designText,
  emailShell,
  itemsHtml,
  itemsText,
  type OrderWithItems,
} from "./layout.js";

// Email sent to the customer after they send a custom design request
export function buildQuoteReceivedEmail(
  order: OrderWithItems,
  orderUrl: string,
  whatsappUrl: string | null,
) {
  const subject = `We received your custom design request ${order.reference}`;
  const firstName = order.customerName.split(" ")[0];

  // HTML version
  const html = emailShell(
    `Thank you, ${firstName}!`,
    `
    <p style="font-size:14px;line-height:1.5">We received your custom design request <strong>${escapeHtml(order.reference)}</strong>.</p>
    ${designHtml(order)}
    ${itemsHtml(order)}
    ${order.instructions ? `<p style="font-size:14px;line-height:1.5"><strong>Your description:</strong><br>${escapeHtml(order.instructions)}</p>` : ""}
    <p style="font-size:14px;line-height:1.5;background:#f1e9e2;padding:12px;border-radius:6px">
      PFC will review your design and contact you with a price. You do not need to pay anything now.
    </p>
    <p style="margin:24px 0">
      <a href="${escapeHtml(orderUrl)}" style="background:#6d4e37;color:#fff;padding:12px 20px;border-radius:6px;text-decoration:none;font-size:14px">View your request</a>
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
    `We received your custom design request ${order.reference}.`,
    "",
    designText(order),
    itemsText(order),
    order.instructions ? `\nYour description: ${order.instructions}` : "",
    "",
    "PFC will review your design and contact you with a price. You do not need to pay anything now.",
    "",
    `View your request: ${orderUrl}`,
  ].join("\n");

  return { subject, html, text };
}
