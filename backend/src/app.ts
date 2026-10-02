import express from "express";
import type { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";

// Create the Express app
export const app = express();

// Trust the hosting proxy (Render) so secure cookies and client IPs work correctly
app.set("trust proxy", 1);

// Global middleware: security headers, JSON body parsing, cookie parsing
// NOTE (Phase 6): mount the Paystack webhook BEFORE express.json() using express.raw(),
// so its signature can be verified against the raw body.
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

// Health check: confirms the API is up and can reach the database
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// 404 handler for any route that did not match above
app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

// Central error handler: always returns the same error shape
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
});