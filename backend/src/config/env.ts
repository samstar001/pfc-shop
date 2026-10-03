// Load variables from .env into process.env (local development)
import "dotenv/config";
import { z } from "zod";

// Describe every environment variable the app needs and its type
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // Sessions: secret used to sign the login cookie
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // Admins: comma-separated emails → lowercase array, e.g. "a@x.com,b@y.com"
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),

  // Google OAuth credentials from Google Cloud Console
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),

  // PFC's WhatsApp number in international format, digits only (e.g. 2348012345678). Optional.
  PFC_WHATSAPP_NUMBER: z.string().default(""),

  // Email (Mailgun). All optional: if they are missing, emails are skipped and orders still work.
  MAILGUN_API_KEY: z.string().default(""),
  MAILGUN_DOMAIN: z.string().default(""),
  MAILGUN_REGION: z.enum(["us", "eu"]).default("us"),
  MAIL_FROM: z.string().default(""),
  PFC_NOTIFY_EMAIL: z.string().default(""),
});

// Validate once at startup; the app crashes early with a clear error if something is missing
export const env = schema.parse(process.env);
