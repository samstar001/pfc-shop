import { Router } from "express";
import { imageUpload } from "../../middleware/upload.js";
import { uploadLimiter } from "../../middleware/rateLimit.js";
import { uploadDesignImage } from "./controller.js";

// Public upload routes (guests can send custom design requests)
export const uploadsRouter = Router();

// The limiter runs first so spammers are stopped before any file is read
uploadsRouter.post(
  "/uploads/design",
  uploadLimiter,
  imageUpload,
  uploadDesignImage,
);
