import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { SESSION_COOKIE, verifySession } from "../lib/session.js";
import { HttpError } from "./errorHandler.js";

// Runs on every request: if a valid session cookie exists, load the user into req.user
export async function attachUser(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  try {
    const token = req.cookies?.[SESSION_COOKIE];
    if (typeof token === "string") {
      const userId = await verifySession(token);
      if (userId) {
        const user = await prisma.user.findUnique({ where: { id: userId } });
        if (user) req.user = user;
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

// Route guard: must be signed in
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user)
    return next(new HttpError(401, "UNAUTHENTICATED", "Please sign in"));
  next();
}

// Route guard: must be signed in AND be an admin (checked on the server, never trust the UI)
export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (!req.user)
    return next(new HttpError(401, "UNAUTHENTICATED", "Please sign in"));
  if (req.user.role !== "ADMIN")
    return next(new HttpError(403, "FORBIDDEN", "Admins only"));
  next();
}
