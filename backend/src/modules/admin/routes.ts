import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";
import {
  adminGetOrder,
  adminListOrders,
  adminStats,
  adminUpdateOrderStatus,
} from "./orders.controller.js";
import { imageUpload } from "../../middleware/upload.js";
import {
  adminCreateCategory,
  adminCreateProduct,
  adminDeleteCategory,
  adminDeleteProduct,
  adminGetProduct,
  adminListCategories,
  adminListProducts,
  adminUpdateCategory,
  adminUpdateProduct,
  adminUploadImage,
} from "./catalog.controller.js";

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

// Products
adminRouter.get("/admin/products", adminListProducts);
adminRouter.post("/admin/products", adminCreateProduct);
adminRouter.get("/admin/products/:id", adminGetProduct);
adminRouter.patch("/admin/products/:id", adminUpdateProduct);
adminRouter.delete("/admin/products/:id", adminDeleteProduct);

// Categories
adminRouter.get("/admin/categories", adminListCategories);
adminRouter.post("/admin/categories", adminCreateCategory);
adminRouter.patch("/admin/categories/:id", adminUpdateCategory);
adminRouter.delete("/admin/categories/:id", adminDeleteCategory);

// Image upload (multer reads the file first)
adminRouter.post("/admin/uploads/image", imageUpload, adminUploadImage);
