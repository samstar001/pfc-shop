import type { Request, Response } from "express";
import { z } from "zod";
import { HttpError } from "../../middleware/errorHandler.js";
import { detectImageType } from "../../utils/image.js";
import { uploadImage } from "../../services/cloudinary.js";
import {
  createCategoryBody,
  createProductBody,
  listProductsQuery,
  updateCategoryBody,
  updateProductBody,
} from "./catalog.schema.js";
import * as service from "./catalog.service.js";

const idParam = z.string().uuid();

// ---------- Products ----------
export async function adminListProducts(req: Request, res: Response) {
  res.json(await service.listProducts(listProductsQuery.parse(req.query)));
}

export async function adminGetProduct(req: Request, res: Response) {
  const product = await service.getProduct(idParam.parse(req.params.id));
  if (!product) throw new HttpError(404, "NOT_FOUND", "Product not found");
  res.json(product);
}

export async function adminCreateProduct(req: Request, res: Response) {
  const created = await service.createProduct(
    createProductBody.parse(req.body),
  );
  res.status(201).json(created);
}

export async function adminUpdateProduct(req: Request, res: Response) {
  const id = idParam.parse(req.params.id);
  await service.updateProduct(id, updateProductBody.parse(req.body));
  res.json({ ok: true });
}

export async function adminDeleteProduct(req: Request, res: Response) {
  await service.deleteProduct(idParam.parse(req.params.id));
  res.json({ ok: true });
}

// ---------- Categories ----------
export async function adminListCategories(_req: Request, res: Response) {
  res.json({ items: await service.listCategories() });
}

export async function adminCreateCategory(req: Request, res: Response) {
  res
    .status(201)
    .json(await service.createCategory(createCategoryBody.parse(req.body)));
}

export async function adminUpdateCategory(req: Request, res: Response) {
  await service.updateCategory(
    idParam.parse(req.params.id),
    updateCategoryBody.parse(req.body),
  );
  res.json({ ok: true });
}

export async function adminDeleteCategory(req: Request, res: Response) {
  await service.deleteCategory(idParam.parse(req.params.id));
  res.json({ ok: true });
}

// ---------- Image upload ----------
// POST /admin/uploads/image (multipart form, field "file") → { url }
export async function adminUploadImage(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new HttpError(400, "NO_FILE", "Choose an image to upload");

  // Check the real file type from its bytes
  if (!detectImageType(file.buffer)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_TYPE",
      "Only JPEG, PNG or WebP images are allowed",
    );
  }

  try {
    const url = await uploadImage(file.buffer, "products");
    res.status(201).json({ url });
  } catch (err) {
    if (err instanceof HttpError) throw err;
    console.error("[upload] Cloudinary failed", err);
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "Could not upload the image, please try again",
    );
  }
}
