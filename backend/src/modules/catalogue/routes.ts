import { Router } from "express";
import { getCategories, getProduct, getProducts } from "./controller.js";

// Public, read-only catalogue routes
export const catalogueRouter = Router();

catalogueRouter.get("/categories", getCategories);
catalogueRouter.get("/products", getProducts);
catalogueRouter.get("/products/:slug", getProduct);
