// Sends one test email so you can check Mailgun before placing a real order.
// Usage: npm run mail:test -- someone@example.com   (defaults to PFC_NOTIFY_EMAIL)
import { env } from "../src/config/env.js";
import { sendEmail } from "../src/services/mailgun.js";

const to = process.argv[2] || env.PFC_NOTIFY_EMAIL;

if (!to) {
  console.error("Pass an email address, or set PFC_NOTIFY_EMAIL");
  process.exit(1);
}

const result = await sendEmail({
  to,
  subject: "PFC Mailgun test",
  text: "If you can read this, Mailgun is working.",
  html: "<p>If you can read this, <strong>Mailgun is working</strong>.</p>",
});

console.log(result);
process.exit(result.ok ? 0 : 1);
