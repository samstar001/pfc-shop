import { OAuth2Client } from "google-auth-library";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";
import { HttpError } from "../../middleware/errorHandler.js";

// Google OAuth client configured from our env vars
const client = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: env.GOOGLE_REDIRECT_URI,
});

// The Google profile fields we care about
export type GoogleProfile = {
  googleSub: string;
  email: string;
  name: string;
  avatarUrl: string | null;
};

// Build the URL of Google's sign-in page
export function buildGoogleAuthUrl(state: string): string {
  return client.generateAuthUrl({
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

// Exchange the one-time code for tokens, then VERIFY the ID token with Google's public keys
export async function getGoogleProfile(code: string): Promise<GoogleProfile> {
  const { tokens } = await client.getToken(code);
  if (!tokens.id_token)
    throw new HttpError(
      400,
      "OAUTH_FAILED",
      "Google did not return an ID token",
    );

  const ticket = await client.verifyIdToken({
    idToken: tokens.id_token,
    audience: env.GOOGLE_CLIENT_ID,
  });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email || !p.email_verified) {
    throw new HttpError(
      400,
      "OAUTH_FAILED",
      "Google account has no verified email",
    );
  }

  return {
    googleSub: p.sub,
    email: p.email.toLowerCase(),
    name: p.name ?? p.email,
    avatarUrl: p.picture ?? null,
  };
}

// Create the user on first sign-in, or refresh their details on later sign-ins.
// Admin role comes from ADMIN_EMAILS and is re-applied on every login.
export async function upsertUser(profile: GoogleProfile) {
  const role: "ADMIN" | "CUSTOMER" = env.ADMIN_EMAILS.includes(profile.email)
    ? "ADMIN"
    : "CUSTOMER";
  return prisma.user.upsert({
    where: { googleSub: profile.googleSub },
    update: {
      email: profile.email,
      name: profile.name,
      avatarUrl: profile.avatarUrl,
      role,
    },
    create: { ...profile, role },
  });
}
