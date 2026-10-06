import multer from "multer";

// Accept ONE file in a form field called "file", kept in memory, max 5 MB
export const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1 },
}).single("file");
