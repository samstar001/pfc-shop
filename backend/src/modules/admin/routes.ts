import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import {
  adminGetOrder,
  adminListOrders,
  adminStats,
  adminUpdateOrderStatus,
} from "./orders.controller.js";

// Every route under /admin requires an admin (checked on the server)
export const adminRouter = Router();
adminRouter.use("/admin", requireAdmin);

// Quick check: 200 for admins, 401 if signed out, 403 for normal users
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true, email: req.user?.email });
});

// Dashboard numbers
adminRouter.get("/admin/stats", adminStats);

// Orders
adminRouter.get("/admin/orders", adminListOrders);
adminRouter.get("/admin/orders/:id", adminGetOrder);
adminRouter.patch("/admin/orders/:id/status", adminUpdateOrderStatus);
