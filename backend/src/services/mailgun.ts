export {};
import { env } from "../config/env.js";

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  text: string;
};
export type SendResult =
  | { ok: true; id?: string }
  | { ok: false; skipped?: boolean; error: string };

// US and EU accounts use different API hosts
const baseUrl =
  env.MAILGUN_REGION === "eu"
    ? "https://api.eu.mailgun.net"
    : "https://api.mailgun.net";

// Emails can only be sent when the key and domain are configured
export function emailConfigured(): boolean {
  return Boolean(env.MAILGUN_API_KEY && env.MAILGUN_DOMAIN);
}

// Send one email through Mailgun's HTTP API. Never throws: failures are logged and returned.
export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  // Skip quietly when Mailgun is not set up (e.g. a fresh local environment)
  if (!emailConfigured()) {
    console.warn(`[mail] Mailgun not configured, skipping email to ${msg.to}`);
    return { ok: false, skipped: true, error: "Mailgun not configured" };
  }

  const from = env.MAIL_FROM || `PFC <postmaster@${env.MAILGUN_DOMAIN}>`;
  const body = new URLSearchParams({
    from,
    to: msg.to,
    subject: msg.subject,
    text: msg.text,
    html: msg.html,
  });

  try {
    // Basic auth with the username "api" and the private API key
    const res = await fetch(`${baseUrl}/v3/${env.MAILGUN_DOMAIN}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${env.MAILGUN_API_KEY}`).toString("base64")}`,
      },
      body,
      signal: AbortSignal.timeout(10_000), // do not hang forever if Mailgun is slow
    });
    const data = (await res.json().catch(() => ({}))) as {
      id?: string;
      message?: string;
    };

    // Mailgun rejected it (wrong key, unauthorized sandbox recipient, ...)
    if (!res.ok) {
      console.error(
        `[mail] Mailgun ${res.status} for ${msg.to}: ${data.message ?? "no message"}`,
      );
      return { ok: false, error: data.message ?? `HTTP ${res.status}` };
    }

    console.log(`[mail] sent "${msg.subject}" to ${msg.to}`);
    return { ok: true, id: data.id };
  } catch (err) {
    console.error(`[mail] failed to send to ${msg.to}`, err);
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Unknown error",
    };
  }
}
