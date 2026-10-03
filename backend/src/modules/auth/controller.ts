import { randomBytes } from "node:crypto";
import type { Request, Response } from "express";
import { env } from "../../config/env.js";
import {
  OAUTH_COOKIE,
  SESSION_COOKIE,
  clearCookieOptions,
  oauthCookieOptions,
  sessionCookieOptions,
  signSession,
} from "../../lib/session.js";
import { buildGoogleAuthUrl, getGoogleProfile, upsertUser } from "./service.js";

// Only allow redirects to paths on our own site (prevents open-redirect attacks)
function safeNext(raw: unknown): string {
  if (
    typeof raw === "string" &&
    raw.startsWith("/") &&
    !raw.startsWith("//") &&
    !raw.includes("\\")
  )
    return raw;
  return "/";
}

// Public view of a user (never expose googleSub or internal fields)
function toPublicUser(u: NonNullable<Request["user"]>) {
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    avatarUrl: u.avatarUrl,
    role: u.role,
  };
}

// GET /auth/google/login?next=/checkout — remember where to return, then go to Google
export function googleLogin(req: Request, res: Response) {
  const state = randomBytes(24).toString("hex"); // random value that must come back unchanged
  const next = safeNext(req.query.next);
  res.cookie(OAUTH_COOKIE, { state, next }, oauthCookieOptions);
  res.redirect(buildGoogleAuthUrl(state));
}

// GET /auth/google/callback — Google sends the user back here
export async function googleCallback(req: Request, res: Response) {
  const saved = req.cookies?.[OAUTH_COOKIE];
  res.clearCookie(OAUTH_COOKIE, clearCookieOptions);

  // The user pressed "Cancel" on Google's screen
  if (req.query.error)
    return res.redirect(`${env.FRONTEND_URL}/login?error=denied`);

  // Check the state matches what we stored (protects against forged callbacks)
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  const valid =
    saved &&
    typeof saved === "object" &&
    typeof saved.state === "string" &&
    saved.state === state;
  if (!code || !valid)
    return res.redirect(`${env.FRONTEND_URL}/login?error=state`);

  try {
    // Verify with Google, create/update the user, start a session
    const profile = await getGoogleProfile(code);
    const user = await upsertUser(profile);
    res.cookie(
      SESSION_COOKIE,
      await signSession(user.id),
      sessionCookieOptions,
    );
    return res.redirect(`${env.FRONTEND_URL}${safeNext(saved.next)}`);
  } catch (err) {
    console.error("Google sign-in failed", err);
    return res.redirect(`${env.FRONTEND_URL}/login?error=failed`);
  }
}

// GET /auth/me — the current user, or { user: null } when signed out
export function me(req: Request, res: Response) {
  res.set("Cache-Control", "no-store");
  res.json({ user: req.user ? toPublicUser(req.user) : null });
}

// POST /auth/logout — delete the session cookie
export function logout(_req: Request, res: Response) {
  res.clearCookie(SESSION_COOKIE, clearCookieOptions);
  res.status(204).end();
}
