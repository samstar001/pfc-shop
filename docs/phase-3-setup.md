# Phase 3 — Google Authentication (HNG requirement ⭐)

**Goal:** people can sign in with Google on the live site, a `User` row is created in Neon, the header shows who is signed in, and admin-only routes are protected on the server.

Put this file at `docs/phase-3-setup.md`. One branch for the whole feature: `feat/google-auth`.

## How it works (so the code makes sense)

```
Browser ─► /api/v1/auth/google/login        (Vercel rewrites to Express)
Express ─► sets a short-lived "state" cookie, redirects to Google
Google  ─► user picks account, consents
Google  ─► redirects browser to  <frontend>/api/v1/auth/google/callback?code=…&state=…
Express ─► checks state cookie, exchanges code, VERIFIES the Google ID token,
           upserts the User (ADMIN if email is in ADMIN_EMAILS),
           sets httpOnly cookie "pfc_session" (signed JWT holding only the user id),
           redirects to the page the user came from
Every request ─► attachUser reads the cookie, loads the user from Neon (role always fresh)
```

Key design choices (see agent.md D16, D17):

- The Google **redirect URI is on the frontend domain** and is proxied to Express by the `/api` rewrite. The browser only ever sees one domain, so the cookie is first-party and no CORS or cross-site cookie tricks are needed.
- The JWT contains only the user id. Roles are read from the database on each request.
- Tokens are never stored in `localStorage`.

---

# Part 0 — Google Cloud Console setup (≈15 min)

1. Open https://console.cloud.google.com → project picker → **New Project** → name `pfc-shop` → Create, then select it.
2. Open **Google Auth Platform** (search for it in the top bar; older UI: _APIs & Services → OAuth consent screen_) → **Get started**:
   - **App name:** `PAT Footwear Collection` (this is shown to users on the Google screen)
   - **User support email:** your Gmail
   - **Audience:** **External**
   - **Contact email:** your Gmail → agree to the policy → Create.
3. **Clients** (older UI: _Credentials_) → **Create client** → **Web application** → name `pfc-web`.
   - **Authorized JavaScript origins**
     - `http://localhost:3000`
     - `https://pfc-shop.vercel.app`
   - **Authorized redirect URIs** (must match exactly, no trailing slash)
     - `http://localhost:3000/api/v1/auth/google/callback`
     - `https://pfc-shop.vercel.app/api/v1/auth/google/callback`
   - Create → copy the **Client ID** and **Client secret** (keep the secret private).
4. **Audience** page → while the app is in **Testing**, only listed _test users_ can sign in. HNG reviewers and customers are not on that list, so click **Publish app** (status → _In production_). The scopes we use (`openid`, `email`, `profile`) are basic and do **not** require Google verification.

   Until you publish, add your own Gmail (and any account you'll test with) under **Test users**.

> Google changes console wording often. If a label differs, the goal is the same: a _Web application_ OAuth client with the origins and redirect URIs above, and the app _published_.

---

# Part 1 — Branch and install

```bash
git checkout develop && git pull
git checkout -b feat/google-auth
cd backend
npm i google-auth-library jose
```

Generate a session secret (any 48+ random bytes):

```bash
openssl rand -hex 48
```

Add to `backend/.env` and `backend/.env.example` (example gets empty values):

```
JWT_SECRET=<paste the random string>
ADMIN_EMAILS=samstarmichael@gmail.com
GOOGLE_CLIENT_ID=<from Google>
GOOGLE_CLIENT_SECRET=<from Google>
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback
```

---

# Part 2 — Backend

## 2.1 `src/config/env.ts` (full file)

```ts
// Load variables from .env into process.env (local development)
import "dotenv/config";
import { z } from "zod";

// Describe every environment variable the app needs and its type
const schema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),

  // Sessions: secret used to sign the login cookie
  JWT_SECRET: z.string().min(32, "JWT_SECRET must be at least 32 characters"),

  // Admins: comma-separated emails → lowercase array, e.g. "a@x.com,b@y.com"
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),

  // Google OAuth credentials from Google Cloud Console
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  GOOGLE_REDIRECT_URI: z.string().url(),
});

// Validate once at startup; the app crashes early with a clear error if something is missing
export const env = schema.parse(process.env);
```

## 2.2 `src/lib/session.ts`

```ts
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
```

## 2.3 `src/types/express.d.ts`

```ts
import type { User } from "@prisma/client";

// Tell TypeScript that req.user may exist after the attachUser middleware runs
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}

export {};
```

## 2.4 `src/middleware/auth.ts`

```ts
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
```

## 2.5 `src/modules/auth/service.ts`

```ts
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
```

## 2.6 `src/modules/auth/controller.ts`

```ts
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
```

## 2.7 `src/modules/auth/routes.ts`

```ts
import { Router } from "express";
import { googleCallback, googleLogin, logout, me } from "./controller.js";

// Authentication routes
export const authRouter = Router();

authRouter.get("/auth/google/login", googleLogin);
authRouter.get("/auth/google/callback", googleCallback);
authRouter.get("/auth/me", me);
authRouter.post("/auth/logout", logout);
```

## 2.8 `src/modules/admin/routes.ts` (a tiny protected route to prove the guard works)

```ts
import { Router } from "express";
import { requireAdmin } from "../../middleware/auth.js";

// Every route in this router requires an admin
export const adminRouter = Router();
adminRouter.use("/admin", requireAdmin);

// GET /admin/ping — returns 200 for admins, 401 if signed out, 403 for normal users
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true, email: req.user?.email });
});
```

## 2.9 `src/app.ts` (full file)

```ts
import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma.js";
import { attachUser } from "./middleware/auth.js";
import { errorHandler, notFound } from "./middleware/errorHandler.js";
import { adminRouter } from "./modules/admin/routes.js";
import { authRouter } from "./modules/auth/routes.js";
import { catalogueRouter } from "./modules/catalogue/routes.js";

// Create the Express app
export const app = express();

// Trust the hosting proxy (Render) so secure cookies and client IPs work correctly
app.set("trust proxy", 1);

// Global middleware: security headers, JSON body parsing, cookie parsing, then load the signed-in user
// NOTE (Phase 6): mount the Paystack webhook BEFORE express.json() using express.raw(),
// so its signature can be verified against the raw body.
app.use(helmet());
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());
app.use(attachUser);

// Health check: confirms the API is up and can reach the database
app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

// Feature routes (each phase adds one here)
app.use("/api/v1", authRouter);
app.use("/api/v1", catalogueRouter);
app.use("/api/v1", adminRouter);

// 404 for unmatched routes, then the central error handler (must stay last)
app.use(notFound);
app.use(errorHandler);
```

## 2.10 Test the backend

```bash
npm run dev
```

The server crashes on startup with a Zod error if any new env var is missing; fix `.env` and retry. The full browser flow is easiest to test once the frontend is done (Part 3).

---

# Part 3 — Frontend

```bash
cd ../frontend
```

## 3.1 `src/lib/api/types.ts` — add this type at the bottom

```ts
// The signed-in user as returned by GET /auth/me
export type User = {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  role: "CUSTOMER" | "ADMIN";
};
```

## 3.2 `src/lib/auth/AuthProvider.tsx`

```tsx
"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import type { User } from "@/lib/api/types";

// What any component can read about the current session
type AuthState = {
  user: User | null;
  loading: boolean;
  refresh: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Ask the API who is signed in (the session cookie is sent automatically)
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/v1/auth/me", { cache: "no-store" });
      const data = await res.json();
      setUser(data.user ?? null);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // End the session on the server, then clear it locally
  const logout = useCallback(async () => {
    await fetch("/api/v1/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  // Check the session once when the app loads
  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <AuthContext.Provider value={{ user, loading, refresh, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

// Hook used by components: const { user, logout } = useAuth()
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}
```

## 3.3 `src/components/layout/UserMenu.tsx`

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

// Right side of the header: Sign in, or the signed-in user's links
export default function UserMenu() {
  const { user, loading, logout } = useAuth();

  // Placeholder while we check the session
  if (loading)
    return <span className="h-5 w-20 animate-pulse rounded bg-gray-200" />;

  // Signed out
  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded bg-black px-3 py-1.5 text-sm text-white"
      >
        Sign in
      </Link>
    );
  }

  // Signed in
  return (
    <div className="flex items-center gap-3 text-sm">
      <Link href="/account" className="hover:underline">
        {user.name.split(" ")[0]}
      </Link>
      {user.role === "ADMIN" && (
        <Link href="/admin/products" className="rounded border px-2 py-0.5">
          Admin
        </Link>
      )}
      <button onClick={logout} className="text-gray-600 hover:text-black">
        Sign out
      </button>
    </div>
  );
}
```

## 3.4 `src/components/layout/Header.tsx` (full file — adds `UserMenu`)

```tsx
import Link from "next/link";
import UserMenu from "./UserMenu";

// Main navigation links shown on every page
const links = [
  { href: "/shop", label: "Shop" },
  { href: "/custom-design", label: "Custom Design" },
  { href: "/how-to-order", label: "How to Order" },
  { href: "/about", label: "About" },
  { href: "/contact", label: "Contact" },
];

export default function Header() {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-4">
        {/* Brand / home link */}
        <Link href="/" className="text-lg font-bold tracking-tight">
          PFC
        </Link>

        {/* Page links */}
        <nav className="flex flex-wrap gap-4 text-sm text-gray-700">
          {links.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-black">
              {l.label}
            </Link>
          ))}
        </nav>

        {/* Sign in / user menu */}
        <UserMenu />
      </div>
    </header>
  );
}
```

## 3.5 `src/app/layout.tsx` — wrap the body content in `AuthProvider`

Keep the generated fonts/imports. Add the import and wrap the existing content:

```tsx
import { AuthProvider } from "@/lib/auth/AuthProvider";

// inside <body ...>:
<AuthProvider>
  <Header />
  <main className="mx-auto max-w-6xl px-4 py-8">{children}</main>
  <Footer />
</AuthProvider>;
```

## 3.6 `src/app/login/page.tsx`

```tsx
export const metadata = { title: "Sign in" };

// In Next.js 15+, searchParams is a Promise
type Props = { searchParams: Promise<{ next?: string; error?: string }> };

// Friendly messages for the error codes the backend can send back
const errors: Record<string, string> = {
  denied: "Sign-in was cancelled.",
  state: "Your sign-in session expired. Please try again.",
  failed: "We couldn't sign you in with Google. Please try again.",
};

export default async function LoginPage({ searchParams }: Props) {
  const { next, error } = await searchParams;

  // Only pass on site-relative paths
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <div className="mx-auto max-w-sm text-center">
      <h1 className="text-2xl font-bold">Sign in</h1>
      <p className="mt-2 text-gray-600">
        Use your Google account to sign in or create an account.
      </p>

      {/* Error message, if any */}
      {error && (
        <p className="mt-4 rounded bg-red-50 p-3 text-sm text-red-700">
          {errors[error] ?? "Something went wrong."}
        </p>
      )}

      {/* Plain <a> on purpose: this must be a full page navigation to the API, not a client-side route */}
      <a
        href={`/api/v1/auth/google/login?next=${encodeURIComponent(safeNext)}`}
        className="mt-6 inline-block w-full rounded border border-gray-300 bg-white px-5 py-3 font-medium shadow-sm hover:bg-gray-50"
      >
        Continue with Google
      </a>
    </div>
  );
}
```

## 3.7 `src/app/account/page.tsx`

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AccountPage() {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>;

  // Not signed in: send them to the login page, then back here
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/account" className="underline">
          sign in
        </Link>{" "}
        to view your account.
      </p>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">My account</h1>
      <p className="mt-3">{user.name}</p>
      <p className="text-gray-600">{user.email}</p>
      {/* Order history arrives in Phase 7 */}
      <p className="mt-6 text-sm text-gray-500">
        Your order history will appear here.
      </p>
    </div>
  );
}
```

## 3.8 `src/app/admin/layout.tsx` (UI guard only; the real protection is on the server)

```tsx
"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth/AuthProvider";

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, loading } = useAuth();

  if (loading) return <p>Loading...</p>;

  // Signed out
  if (!user) {
    return (
      <p>
        Please{" "}
        <Link href="/login?next=/admin/products" className="underline">
          sign in
        </Link>{" "}
        as an admin.
      </p>
    );
  }

  // Signed in but not an admin
  if (user.role !== "ADMIN")
    return <p>You don&apos;t have access to this page.</p>;

  return <>{children}</>;
}
```

## 3.9 Test locally

Run both apps, then:

1. Open http://localhost:3000 → header shows **Sign in**.
2. Click it → **Continue with Google** → choose your account → you land back on the home page and the header shows your first name plus an **Admin** badge (your email is in `ADMIN_EMAILS`).
3. Open http://localhost:3000/api/v1/auth/me → shows your user JSON.
4. Open http://localhost:3000/api/v1/admin/ping → `{"ok":true,"email":"…"}`.
5. Click **Sign out** → `/api/v1/auth/me` now returns `{"user":null}` and `/api/v1/admin/ping` returns 401.
6. Neon console → table `User` has your row with `role = ADMIN`.
7. (Optional) Sign in with a second Google account that is **not** in `ADMIN_EMAILS` in a private window: `/admin/ping` should return 403.

Commit:

```bash
cd ..
git add . && git commit -m "feat(auth): google oauth login, sessions, admin guard and header user menu"
git push -u origin feat/google-auth
git checkout develop && git merge --no-ff feat/google-auth && git push
```

---

# Part 4 — Deploy to production

**Order matters.** The backend refuses to start if env vars are missing, so set them BEFORE merging to `main`.

1. **Render → your service → Environment**, add:
   - `JWT_SECRET` — a _different_ random string from local (`openssl rand -hex 48`)
   - `ADMIN_EMAILS` — `samstarmichael@gmail.com`
   - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — same as local
   - `GOOGLE_REDIRECT_URI` — `https://pfc-shop.vercel.app/api/v1/auth/google/callback`
   - Confirm `FRONTEND_URL` = `https://pfc-shop.vercel.app` (no trailing slash)
2. Release:

```bash
git checkout main && git pull && git merge --no-ff develop && git push
git checkout develop
```

3. Wait for Render and Vercel to finish deploying, then repeat the test steps on https://pfc-shop.vercel.app.

---

# Troubleshooting

| Symptom                                                                | Cause / fix                                                                                                                                                                                                         |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google page: **redirect_uri_mismatch**                                 | The redirect URI in Google Cloud and `GOOGLE_REDIRECT_URI` must match character-for-character (scheme, host, port, path, no trailing slash). Production value must use the Vercel domain.                           |
| Google page: **Access blocked / app not verified / 403 access_denied** | App is still in _Testing_: add the account under **Test users** or **Publish app**.                                                                                                                                 |
| Back on `/login?error=state`                                           | The `pfc_oauth` cookie wasn't sent back. Start from the same domain you'll return to (don't mix `localhost` and `127.0.0.1`).                                                                                       |
| Back on `/login?error=failed`                                          | Check the Render/terminal logs: wrong client secret, clock skew, or ID-token audience mismatch (wrong `GOOGLE_CLIENT_ID`).                                                                                          |
| Signed in, but header still says **Sign in**                           | Look at DevTools → Application → Cookies for `pfc_session`. If missing, the callback didn't run through the rewrite: confirm the redirect URI uses the frontend domain, and that Vercel's `BACKEND_URL` is correct. |
| Render logs: `ZodError` at boot                                        | A new env var is missing on Render.                                                                                                                                                                                 |
| Everyone becomes `CUSTOMER`                                            | `ADMIN_EMAILS` doesn't contain the exact (lowercase) email, or you haven't signed in again since changing it.                                                                                                       |
| First request after idle is slow                                       | Render free tier is waking up (30–60 s).                                                                                                                                                                            |

---

## Done when

- [ ] Sign in with Google works on https://pfc-shop.vercel.app
- [ ] A `User` row appears in Neon; your email has `role = ADMIN`
- [ ] `/api/v1/admin/ping` → 200 for you, 401 signed out, 403 for a non-admin
- [ ] `agent.md` Phase 3 boxes ticked + Progress Log row

## Next: Phase 4 — Cart, Checkout, Orders saved to Neon

Order of work to hit the deadline: **Phase 4 → Phase 5 (Mailgun) → submit**, then Paystack, accounts, admin and custom design.
