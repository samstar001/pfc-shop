import type { CookieOptions } from "express";
import { SignJWT, jwtVerify } from "jose";
import { env } from "../config/env.js";

// Cookie names
export const SESSION_COOKIE = "pfc_session"; // the logged-in session
export const OAUTH_COOKIE = "pfc_oauth"; // temporary data during the Google redirect

const isProd = env.NODE_ENV === "production";
const SESSION_DAYS = 7;
const secret = new TextEncoder().encode(env.JWT_SECRET);

// Settings shared by our cookies: not readable by JavaScript, HTTPS-only in production
const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: "lax",
  path: "/",
};

// Session cookie lasts 7 days; the OAuth cookie only 10 minutes
export const sessionCookieOptions: CookieOptions = {
  ...base,
  maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
};
export const oauthCookieOptions: CookieOptions = {
  ...base,
  maxAge: 10 * 60 * 1000,
};

// Options needed to delete a cookie (must match how it was set)
export const clearCookieOptions: CookieOptions = base;

// Create a signed token that only contains the user's id
export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret);
}

// Check a token's signature and expiry; returns the user id, or null if invalid
export async function verifySession(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, secret);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
