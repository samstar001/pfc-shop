import type { Request, Response } from "express";
import { HttpError } from "../../middleware/errorHandler.js";
import { uploadImage } from "../../services/cloudinary.js";
import { detectImageType } from "../../utils/image.js";

// POST /uploads/design (multipart form, field "file") → { url }
export async function uploadDesignImage(req: Request, res: Response) {
  const file = req.file;
  if (!file) throw new HttpError(400, "NO_FILE", "Choose an image to upload");

  // Check the real file type from its bytes, not from the file name
  if (!detectImageType(file.buffer)) {
    throw new HttpError(
      415,
      "UNSUPPORTED_TYPE",
      "Only JPEG, PNG or WebP images are allowed",
    );
  }

  try {
    const url = await uploadImage(file.buffer, "designs");
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
