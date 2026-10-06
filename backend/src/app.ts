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
import { paymentsRouter } from "./modules/payments/routes.js";
import { webhooksRouter } from "./modules/payments/webhook.routes.js";
import { accountRouter } from "./modules/account/routes.js";

export const app = express();

// Trust the hosting proxy (Render) so secure cookies and client IPs work correctly
app.set("trust proxy", 1);

// 1. GLOBAL SECURITY HEADERS
app.use(helmet());

// 2. PAYSTACK WEBHOOK ROUTE (CRITICAL PAIRING)
// Placed BEFORE express.json() so the internal router can capture the raw body stream
app.use("/api/v1/webhooks", webhooksRouter);

// 3. GLOBAL PARSERS (Applies to all subsequent application feature routes)
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(attachUser);

// 4. HEALTH CHECK ROUTE
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// 5. STANDARD APPLICATION FEATURE ROUTES
app.use("/api/v1", authRouter);
app.use("/api/v1", catalogueRouter);
app.use("/api/v1", ordersRouter);
app.use("/api/v1", adminRouter);
app.use("/api/v1", paymentsRouter);
app.use("/api/v1", accountRouter);

// 6. GLOBAL ERROR HANDLING ORCHESTRATION (Must stay at the absolute bottom)
app.use(notFound);
app.use(errorHandler);
