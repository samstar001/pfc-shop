import { env } from "../config/env.js";
import { buildAdminNewOrderEmail } from "../emails/admin-new-order.js";
import type { OrderWithItems } from "../emails/layout.js";
import { buildOrderConfirmationEmail } from "../emails/order-confirmation.js";
import { sendEmail } from "./mailgun.js";
import { buildWhatsappUrl } from "./whatsapp.js";

// Send the customer confirmation and the PFC notification for a new order.
// NEVER throws: an email problem must not affect the order.
export async function sendOrderEmails(
  order: OrderWithItems,
  accessToken: string,
): Promise<void> {
  try {
    // Link that opens the order page (the token lets guests view it)
    const base = env.FRONTEND_URL.replace(/\/+$/, "");
    const orderUrl = `${base}/order/${encodeURIComponent(order.reference)}?token=${encodeURIComponent(accessToken)}`;

    const jobs: Promise<unknown>[] = [];

    // 1) Customer confirmation (only if they gave an email)
    if (order.customerEmail) {
      const mail = buildOrderConfirmationEmail(
        order,
        orderUrl,
        buildWhatsappUrl(order),
      );
      jobs.push(sendEmail({ to: order.customerEmail, ...mail }));
    }

    // 2) Notification to PFC (falls back to the first admin email)
    const notify = env.PFC_NOTIFY_EMAIL || env.ADMIN_EMAILS[0];
    if (notify) {
      const mail = buildAdminNewOrderEmail(order, orderUrl);
      jobs.push(sendEmail({ to: notify, ...mail }));
    }

    // Wait for both, regardless of individual failures
    await Promise.allSettled(jobs);
  } catch (err) {
    console.error("[mail] sendOrderEmails failed", err);
  }
}
