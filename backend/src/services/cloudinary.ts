import { v2 as cloudinary } from "cloudinary";
import { env } from "../config/env.js";
import { HttpError } from "../middleware/errorHandler.js";

// Uploads only work when all three Cloudinary settings are present
export function cloudinaryConfigured(): boolean {
  return Boolean(
    env.CLOUDINARY_CLOUD_NAME &&
    env.CLOUDINARY_API_KEY &&
    env.CLOUDINARY_API_SECRET,
  );
}

if (cloudinaryConfigured()) {
  cloudinary.config({
    cloud_name: env.CLOUDINARY_CLOUD_NAME,
    api_key: env.CLOUDINARY_API_KEY,
    api_secret: env.CLOUDINARY_API_SECRET,
    secure: true,
  });
}

// Upload an image buffer to Cloudinary and return its https URL
export function uploadImage(buffer: Buffer, folder: string): Promise<string> {
  if (!cloudinaryConfigured()) {
    throw new HttpError(
      503,
      "UPLOADS_UNAVAILABLE",
      "Image uploads are not set up yet",
    );
  }

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: `pfc/${folder}`, resource_type: "image" },
      (err, result) => {
        if (err || !result) return reject(err ?? new Error("Upload failed"));
        resolve(result.secure_url);
      },
    );
    stream.end(buffer);
  });
}
