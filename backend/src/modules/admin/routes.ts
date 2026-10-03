import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";

// Every route in this router requires an admin
export const adminRouter = Router();
adminRouter.use("/admin", requireAdmin);

// GET /admin/ping — returns 200 for admins, 401 if signed out, 403 for normal users
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true, email: req.user?.email });
});
