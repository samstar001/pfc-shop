import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";

// An error we throw on purpose, carrying an HTTP status and a machine-readable code
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

// Handler for any route that did not match
export function notFound(_req: Request, res: Response) {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
}

// Central error handler: every error leaves the API in the same shape
export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  // Invalid request data (from Zod) → 422 with per-field details
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request",
        details: err.issues.map((i) => ({ field: i.path.join("."), issue: i.message })),
      },
    });
  }

  // Errors we threw deliberately (404, 403, ...)
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message } });
  }

  // Anything else is unexpected: log it, hide the details from the client
  console.error(err);
  return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
}