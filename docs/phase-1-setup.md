# Phase 1 — Foundation + First Deploy

**Goal:** a live URL where the frontend shows `API status: ok, db: up`, fetched through the `/api` rewrite from the deployed backend, which is connected to Neon.

Put this file at `docs/phase-1-setup.md` in the repo. Time estimate: 1.5–2.5 hours.

**Prereqs:** Node 20+ (`node -v`), git, a GitHub account, free accounts on Neon, Render and Vercel.

> Never paste secrets (DB URLs, API keys) into chats or commit them. They live in `.env` files and the Render/Vercel dashboards only.

---

## Step 1 — Repo, branches, skeleton

1. On GitHub create an **empty** repo `pfc-shop` (no README, no .gitignore).
2. Locally:

```bash
mkdir pfc-shop && cd pfc-shop
git init -b main
mkdir docs backend frontend
# copy agent.md into the repo root, and this file into docs/phase-1-setup.md
```

3. Create `.gitignore` in the repo root:

```
node_modules
dist
.next
.env
.env.*
!.env.example
.DS_Store
```

4. Create a short `README.md` (title, one-line description, "see agent.md").
5. First commit, then both long-lived branches:

```bash
git add . && git commit -m "chore: initial project docs and skeleton"
git remote add origin https://github.com/<your-username>/pfc-shop.git
git push -u origin main
git checkout -b develop && git push -u origin develop
git checkout -b feat/project-setup
```

You'll do the rest of this phase on `feat/project-setup`.

---

## Step 2 — Neon database

1. Neon console → **New project** (name `pfc-shop`, nearest region).
2. On the project dashboard open **Connect**. You need two strings:
   - **Pooled** connection (host contains `-pooler`) → `DATABASE_URL`
   - **Direct** connection (toggle pooling off) → `DIRECT_URL` (used for migrations)

Keep them for Step 3.

---

## Step 3 — Backend (Express + TypeScript + Prisma)

```bash
cd backend
npm init -y
npm i express helmet cookie-parser zod dotenv @prisma/client@6
npm i -D typescript tsx @types/node @types/express @types/cookie-parser prisma@6
```

> Prisma is pinned to v6 so the schema below is valid as written. Don't upgrade mid-project.

**`package.json`** — set these scripts (keep the rest):

```json
"scripts": {
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "postinstall": "prisma generate"
}
```

**`tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "CommonJS",
    "moduleResolution": "node",
    "rootDir": "src",
    "outDir": "dist",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

**`.env`** (not committed) and **`.env.example`** (committed, empty values):

```
NODE_ENV=development
PORT=8000
DATABASE_URL="postgresql://...-pooler.../neondb?sslmode=require"
DIRECT_URL="postgresql://.../neondb?sslmode=require"
FRONTEND_URL=http://localhost:3000
```

**`src/config/env.ts`**

```ts
import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(8000),
  DATABASE_URL: z.string().min(1),
  FRONTEND_URL: z.string().url().default("http://localhost:3000"),
});

export const env = schema.parse(process.env);
```

**`src/lib/prisma.ts`**

```ts
import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();
```

**`src/app.ts`**

```ts
import express, { NextFunction, Request, Response } from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { prisma } from "./lib/prisma";

export const app = express();

app.set("trust proxy", 1);
app.use(helmet());
// NOTE (Phase 6): the Paystack webhook route must be mounted BEFORE this
// with express.raw() so the signature can be verified on the raw body.
app.use(express.json({ limit: "1mb" }));
app.use(cookieParser());

app.get("/api/v1/health", async (_req, res) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ status: "ok", db: "up", time: new Date().toISOString() });
  } catch (err) {
    console.error(err);
    res.status(503).json({ status: "degraded", db: "down" });
  }
});

app.use((_req, res) => {
  res.status(404).json({ error: { code: "NOT_FOUND", message: "Route not found" } });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err);
  res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Something went wrong" } });
});
```

**`src/server.ts`**

```ts
import { env } from "./config/env";
import { app } from "./app";

app.listen(env.PORT, () => {
  console.log(`API listening on port ${env.PORT} (${env.NODE_ENV})`);
});
```

**`prisma/schema.prisma`** (full data model from agent.md §6)

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

enum Role {
  CUSTOMER
  ADMIN
}

enum OrderType {
  CATALOGUE
  CUSTOM
}

enum OrderStatus {
  NEW
  CONTACTED
  CONFIRMED
  IN_PRODUCTION
  COMPLETED
  CANCELLED
}

enum PaymentStatus {
  UNPAID
  PENDING
  PAID
  FAILED
  NOT_APPLICABLE
}

model User {
  id        String   @id @default(uuid())
  googleSub String   @unique
  email     String   @unique
  name      String
  avatarUrl String?
  role      Role     @default(CUSTOMER)
  createdAt DateTime @default(now())
  orders    Order[]
}

model Category {
  id          String    @id @default(uuid())
  name        String
  slug        String    @unique
  description String?
  imageUrl    String?
  sortOrder   Int       @default(0)
  isActive    Boolean   @default(true)
  products    Product[]
}

model Product {
  id             String      @id @default(uuid())
  categoryId     String
  category       Category    @relation(fields: [categoryId], references: [id])
  name           String
  slug           String      @unique
  description    String
  images         String[]
  colors         Json        // [{ "name": "Black", "hex": "#000000" }]
  sizes          Int[]
  priceNgn       Int         // whole naira
  isFeatured     Boolean     @default(false)
  isNew          Boolean     @default(false)
  isPopular      Boolean     @default(false)
  isCustomizable Boolean     @default(true)
  isPublished    Boolean     @default(true)
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt
  orderItems     OrderItem[]

  @@index([categoryId])
}

model Order {
  id               String        @id @default(uuid())
  reference        String        @unique // PFC-YYYYMMDD-####
  userId           String?
  user             User?         @relation(fields: [userId], references: [id])
  type             OrderType
  customerName     String
  customerPhone    String
  customerEmail    String?
  location         String?
  instructions     String?
  totalQuantity    Int
  subtotalNgn      Int?          // null for custom quote requests
  status           OrderStatus   @default(NEW)
  paymentStatus    PaymentStatus @default(UNPAID)
  paymentReference String?       @unique
  paidAt           DateTime?
  createdAt        DateTime      @default(now())
  updatedAt        DateTime      @updatedAt
  items            OrderItem[]

  @@index([userId])
  @@index([status])
}

model OrderItem {
  id                  String   @id @default(uuid())
  orderId             String
  order               Order    @relation(fields: [orderId], references: [id], onDelete: Cascade)
  productId           String?
  product             Product? @relation(fields: [productId], references: [id], onDelete: SetNull)
  productNameSnapshot String
  categorySnapshot    String?
  unitPriceNgn        Int?
  color               String?
  sizeBreakdown       Json     // { "40": 3, "41": 5 }
  quantity            Int
  footwearType        String?  // custom only
  designImageUrl      String?  // custom / reference image
  colorNote           String?  // custom color description

  @@index([orderId])
}
```

**Run the first migration and start the server**

```bash
npx prisma migrate dev --name init
npm run dev
# in another terminal:
curl http://localhost:8000/api/v1/health
# → {"status":"ok","db":"up","time":"..."}
```

If you see prepared-statement errors with the pooled URL, append `&pgbouncer=true` to `DATABASE_URL`.

Commit:

```bash
cd ..
git add . && git commit -m "feat(backend): express app, health check, prisma schema and init migration"
```

---

## Step 4 — Frontend (Next.js + Tailwind)

```bash
npx create-next-app@latest frontend --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm
```

(Accept the defaults for any other prompt. If it complains the folder isn't empty, delete the empty `frontend/` first.)

**`frontend/.env.local`** (not committed) and **`frontend/.env.example`**:

```
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

**`frontend/next.config.ts`**

```ts
import type { NextConfig } from "next";

const backend = process.env.BACKEND_URL ?? "http://localhost:8000";

const nextConfig: NextConfig = {
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
  images: {
    remotePatterns: [{ protocol: "https", hostname: "res.cloudinary.com" }],
  },
};

export default nextConfig;
```

**`frontend/src/app/page.tsx`** (temporary, proves the link)

```tsx
"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [health, setHealth] = useState("checking...");

  useEffect(() => {
    fetch("/api/v1/health")
      .then((r) => r.json())
      .then((d) => setHealth(JSON.stringify(d)))
      .catch(() => setHealth("API unreachable"));
  }, []);

  return (
    <main className="p-8">
      <h1 className="text-3xl font-bold">PAT Footwear Collection</h1>
      <p className="mt-2 text-sm text-gray-600">API status: {health}</p>
    </main>
  );
}
```

Run both apps (`npm run dev` in `backend/` and in `frontend/`), open http://localhost:3000 and confirm it shows `"status":"ok","db":"up"`.

```bash
git add . && git commit -m "feat(frontend): next.js skeleton with api rewrite and health check"
git push -u origin feat/project-setup
```

---

## Step 5 — Merge into develop, then main

```bash
git checkout develop && git merge --no-ff feat/project-setup && git push
git checkout main && git merge --no-ff develop && git push
git checkout develop
```

`main` now has real code, so it can be deployed.

---

## Step 6 — Deploy the backend (Render)

1. Render → **New → Web Service** → connect the GitHub repo.
2. Settings:
   - **Branch:** `main`
   - **Root Directory:** `backend`
   - **Build Command:** `npm install --include=dev && npx prisma migrate deploy && npm run build`
   - **Start Command:** `npm start`
   - **Instance type:** Free
3. **Environment variables:** `NODE_ENV=production`, `DATABASE_URL`, `DIRECT_URL` (same values as local). Leave `FRONTEND_URL` for now.
4. Deploy. When live, open `https://<your-service>.onrender.com/api/v1/health` → should return `ok` / `up`.

(Render provides `PORT` itself; the app already reads it.)

---

## Step 7 — Deploy the frontend (Vercel)

1. Vercel → **Add New → Project** → import the repo.
2. **Root Directory:** `frontend`. Framework: Next.js (auto-detected).
3. **Environment variables** (set before the first deploy, since rewrites are read at build time):
   - `BACKEND_URL` = `https://<your-service>.onrender.com`
   - `NEXT_PUBLIC_SITE_URL` = your Vercel URL (update after first deploy if it differs)
4. Deploy. **Production Branch** must be `main`.
5. Back on Render, set `FRONTEND_URL` to the Vercel URL and redeploy.

---

## Step 8 — Verify "Done when"

- [ ] Opening the Vercel URL shows `API status: {"status":"ok","db":"up",...}`
- [ ] Neon dashboard → Tables shows `User`, `Category`, `Product`, `Order`, `OrderItem`
- [ ] `main` and `develop` both exist on GitHub
- [ ] Update `agent.md`: tick the Phase 1 boxes and add a Progress Log row with your live URLs

Note the Render free instance sleeps when idle, so the first request after a break can take 30–60 seconds. If the Vercel page says "API unreachable" at first, wait and refresh.

## What's next (Phase 2 — Catalogue)

Seed script (categories + sample products in ₦), catalogue endpoints, Home / Shop / Product pages — branch `feat/catalogue-api` then `feat/catalogue-ui`.