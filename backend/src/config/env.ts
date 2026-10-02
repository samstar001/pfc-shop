// Load variables from .env into process.env (local development)
import "dotenv/config";
import { z } from "zod";

// Describe every environment variable the app needs and its type
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
});

// Validate once at startup; the app crashes early with a clear error if something is missing
export const env = schema.parse(process.env);