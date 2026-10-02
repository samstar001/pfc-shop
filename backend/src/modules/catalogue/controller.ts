import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { listProductsQuery } from "./schema.js";
import * as service from "./service.js";

// GET /categories
export async function getCategories(_req: Request, res: Response) {
  res.json({ items: await service.listCategories() });
}

// GET /products — validate the query string, then fetch
export async function getProducts(req: Request, res: Response) {
  const query = listProductsQuery.parse(req.query);
  res.json(await service.listProducts(query));
}

// GET /products/:slug — 404 if it does not exist
export async function getProduct(req: Request, res: Response) {
  const product = await service.getProductBySlug(String(req.params.slug));
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found");
  res.json(product);
}