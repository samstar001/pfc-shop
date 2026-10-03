import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import { attachUser } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { adminRouter } from "./modules/admin/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { catalogueRouter } from "./modules/catalogue/routes.js";
import { ordersRouter } from "./modules/orders/routes.js";

// Create the Express app
export const app = express();

// Trust the hosting proxy (Render) so secure cookies and client IPs work correctly
app.set("trust proxy", 1);

// Global middleware: security headers, JSON body parsing, cookie parsing, then load the signed-in user
// NOTE (Phase 6): mount the Paystack webhook BEFORE express.json() using express.raw(),
// so its signature can be verified against the raw body.
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(attachUser);

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

// Feature routes (each phase adds one here)
app.use("/api/v1", authRouter);
app.use("/api/v1", catalogueRouter);
app.use("/api/v1", ordersRouter);
app.use("/api/v1", adminRouter);

// 404 for unmatched routes, then the central error handler (must stay last)
app.use(notFound);
app.use(errorHandler);
