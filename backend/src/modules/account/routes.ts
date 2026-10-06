import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { checkoutDefaults, listMyOrders } from "./controller.js";

// Everything under /account needs a signed-in user (401 otherwise)
export const accountRouter = Router();
accountRouter.use("/account", requireAuth);

accountRouter.get("/account/orders", listMyOrders);
accountRouter.get("/account/checkout-defaults", checkoutDefaults);
