# agent.md — PFC Shop Website (Master Project File) — v2

> Single source of truth. Read this first in every session (human or AI agent).
> After every working session update **§15 Decision Log** and **§16 Progress Log**.

**Project:** PAT Footwear Collection (PFC) — online footwear shop
**Context:** HNG Internship Individual Task 2 + real deployment for a family business
**Owner:** Samstar
**Status:** Phases 1–5 ✅ (all 4 HNG requirements live) · Phase 6 (Paystack test payments) in progress (see `docs/phase-6-setup.md`)
**Live:** https://pfc-shop.vercel.app (frontend) · https://pfc-shop.onrender.com (API)
**Submission deadline:** 2026-10-03 (tomorrow). Strategy: **deploy first, submit the live URL, keep shipping to the same URL.**
**Last updated:** 2026-10-02

---

## 1. HNG Task Requirements (non-negotiable)

1. A **checkout page**
2. **Persist everything** in a database (**Neon**)
3. **Confirmation emails** via **Mailgun**
4. **Google authentication** via Google Cloud Console

## 2. Product Direction (changed from the PRD)

The PRD described a WhatsApp-first showroom with no payments or accounts. **Decision (D1): the website is now the main sales channel.**

| Area          | PRD said          | Now                                                                                                           |
| ------------- | ----------------- | ------------------------------------------------------------------------------------------------------------- |
| Main channel  | WhatsApp          | **Website checkout**                                                                                          |
| Payments      | Phase 2           | **In scope, Paystack test mode** (swap to live keys later)                                                    |
| Accounts      | Phase 2           | **In scope: Google sign-in creates the account**; guest checkout still allowed                                |
| WhatsApp      | Primary           | **Secondary**: "Chat with PFC" button + "Send order on WhatsApp" on confirmation page                         |
| Custom design | Upload → WhatsApp | Upload → saved as a **quote request** (no price yet, so no payment) → emailed → PFC replies by email/WhatsApp |
| Prices        | Optional          | **Shown in Naira (₦)**                                                                                        |
| Admin         | Basic             | Google-login admin dashboard (products, categories, orders)                                                   |

Everything else in the PRD (catalogue, filters, color/size/quantity, size-by-size breakdown, SEO, mobile-first, accessibility, graceful failure, secure uploads) still applies.

PRD user types: retail customer, bulk customer, custom-design customer, PFC admin.

## 3. Tech Stack (decided)

| Layer           | Choice                                                                                   | Notes                                                              |
| --------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Frontend        | **Next.js (App Router) + TypeScript + Tailwind**                                         | SEO for product pages, image optimization                          |
| Backend         | **Node.js + Express + TypeScript**                                                       | Samstar's stronger stack (D2)                                      |
| ORM             | **Prisma**                                                                               | Migrations + typed queries; works with Neon                        |
| Validation      | **Zod**                                                                                  | Request validation on every route                                  |
| Database        | **Neon Postgres**                                                                        | Use pooled connection string for the app, direct for migrations    |
| Image storage   | **Cloudinary** (free tier)                                                               | Neon has no file storage. Product images + customer design uploads |
| Email           | **Mailgun** (HTTP API)                                                                   | Sandbox now, verified domain later                                 |
| Auth            | **Google OAuth 2.0** (backend, `google-auth-library`) → signed **httpOnly cookie (JWT)** | Admin = email allow-list                                           |
| Payments        | **Paystack (test mode)**                                                                 | Hosted checkout page + webhook; amounts in kobo                    |
| Frontend deploy | **Vercel**                                                                               | Auto-deploys from `main`                                           |
| Backend deploy  | **Render** (free web service)                                                            | Auto-deploys from `main`                                           |
| CI              | **GitHub Actions**                                                                       | Lint + typecheck + build on PRs                                    |

## 4. Architecture

```
 Customer ─► Next.js (Vercel) ──/api/* rewrite──► Express API (Render)
                  │                                   │
                  │                    ┌──────────────┼──────────────┬───────────────┐
                  ▼                    ▼              ▼              ▼               ▼
            Paystack hosted       Neon Postgres   Cloudinary      Mailgun       Google OAuth
            payment page          (Prisma)        (images)        (emails)      (login)
                  │                                   ▲
                  └──── redirect back ──► /order/confirmed ◄── Paystack webhook ─► POST /webhooks/paystack
```

**How frontend and backend are linked**

- **REST + JSON.** `docs/api-contract.md` is the contract. Backend validates with Zod; frontend mirrors the types in `frontend/src/lib/api/types.ts`.
- **Same-origin proxy:** `next.config.ts` rewrites `/api/:path*` → `${BACKEND_URL}/api/:path*`. Browser only knows the frontend domain, so **no CORS problems and the session cookie "just works"**.
- Server components fetch catalogue data directly from `BACKEND_URL` (cached/ISR); client components call `/api/...`.
- Only env vars couple the two apps (§12).

## 5. Folder Structure (monorepo `pfc-shop/`)

```
pfc-shop/
├── agent.md
├── README.md
├── docs/
│   ├── api-contract.md
│   ├── erd.md
│   ├── user-flows.md
│   └── deployment.md
├── .github/workflows/ci.yml
├── .gitignore
│
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/
│   │   └── seed.ts                 # categories + sample products (placeholder images)
│   ├── src/
│   │   ├── server.ts               # listen()
│   │   ├── app.ts                  # express app, middleware, routes
│   │   ├── config/env.ts           # zod-validated env
│   │   ├── lib/prisma.ts
│   │   ├── middleware/
│   │   │   ├── auth.ts             # attachUser, requireAuth, requireAdmin
│   │   │   ├── validate.ts         # zod request validator
│   │   │   ├── rateLimit.ts
│   │   │   └── errorHandler.ts     # unified error shape
│   │   ├── modules/
│   │   │   ├── auth/               # routes, controller, service
│   │   │   ├── catalogue/          # categories + products (public)
│   │   │   ├── orders/
│   │   │   ├── payments/           # initialize, verify, webhook
│   │   │   ├── uploads/
│   │   │   ├── account/            # "my orders"
│   │   │   └── admin/
│   │   ├── services/
│   │   │   ├── mailgun.ts
│   │   │   ├── paystack.ts
│   │   │   ├── cloudinary.ts
│   │   │   └── whatsapp.ts         # builds message text + wa.me URL
│   │   ├── emails/                 # order-confirmation.ts, admin-new-order.ts, quote-received.ts
│   │   └── utils/                  # reference generator, money helpers
│   ├── tests/
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
│
└── frontend/
    ├── src/
    │   ├── app/
    │   │   ├── page.tsx                         # Home
    │   │   ├── shop/page.tsx                    # catalogue + filters
    │   │   ├── shop/[category]/page.tsx
    │   │   ├── product/[slug]/page.tsx          # details + configurator
    │   │   ├── cart/page.tsx
    │   │   ├── checkout/page.tsx                # ⭐ details + summary + Pay
    │   │   ├── order/[reference]/page.tsx       # confirmation / status
    │   │   ├── custom-design/page.tsx
    │   │   ├── account/page.tsx                 # my orders
    │   │   ├── login/page.tsx
    │   │   ├── admin/{products,categories,orders}/…
    │   │   ├── how-to-order/ about/ contact/
    │   │   └── layout.tsx, sitemap.ts, robots.ts
    │   ├── components/{ui,product,cart,layout}/
    │   ├── lib/
    │   │   ├── api/client.ts + types.ts
    │   │   ├── cart/store.ts                    # Zustand, persisted
    │   │   └── format.ts                        # ₦ formatting
    │   └── hooks/
    ├── next.config.ts                           # rewrites + image domains
    ├── package.json
    └── .env.example
```

## 6. Data Model (Prisma / Neon)

```
User         id, googleSub (unique), email (unique), name, avatarUrl, role (CUSTOMER|ADMIN), createdAt
Category     id, name, slug (unique), description, imageUrl, sortOrder, isActive
Product      id, categoryId, name, slug (unique), description, images (string[]),
             colors (json [{name,hex}]), sizes (int[]), priceNgn (int, naira),
             isFeatured, isNew, isPopular, isCustomizable, isPublished, createdAt, updatedAt
Order        id, reference (PFC-YYYYMMDD-####), userId?, type (CATALOGUE|CUSTOM),
             customerName, customerPhone, customerEmail?, location?, instructions?,
             totalQuantity, subtotalNgn (null for custom),
             status (NEW|CONTACTED|CONFIRMED|IN_PRODUCTION|COMPLETED|CANCELLED),
             paymentStatus (UNPAID|PENDING|PAID|FAILED|NOT_APPLICABLE),
             paymentReference?, paidAt?, createdAt, updatedAt
OrderItem    id, orderId, productId?, productNameSnapshot, categorySnapshot, unitPriceNgn?,
             color, sizeBreakdown (json {"40":3,"41":5}), quantity,
             footwearType? (custom), designImageUrl?, colorNote?
```

Rules: totals and prices are **always recomputed on the server** from the DB; order items keep **snapshots** so old orders stay correct; Paystack amount = `subtotalNgn * 100` kobo. Custom request = `Order(type=CUSTOM, paymentStatus=NOT_APPLICABLE)`.

## 7. API Contract (v1) — base `/api/v1`

Errors: `{ "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "field": "phone", "issue": "…" }] } }`
Auth cookie: `pfc_session` (httpOnly). 🔓 public · 🔐 logged-in · 🛡️ admin.

**Auth**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/auth/google/login?next=/checkout` | 🔓 | Redirect to Google |
| GET | `/auth/google/callback` | 🔓 | Upsert user, set cookie, redirect to `next` |
| GET | `/auth/me` | 🔓 | `{ user }`, or `{ user: null }` when signed out (no 401, avoids console noise) |
| POST | `/auth/logout` | 🔐 | Clear cookie |

**Catalogue** 🔓
| GET | `/categories` | Active categories |
|---|---|---|
| GET | `/products?category=&color=&size=&featured=&q=&page=&pageSize=` | Paginated published products |
| GET | `/products/:slug` | Detail |

**Orders**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/orders` | 🔓 (links user if logged in) | Create order. Returns `{ id, reference, subtotalNgn, paymentStatus, accessToken, whatsappUrl }` |
| GET | `/orders/:reference?token=` | 🔓 token or 🔐 owner/admin | Order status page data |
| GET | `/account/orders` | 🔐 | My orders |

`POST /orders` body:

```json
{
  "type": "CATALOGUE",
  "customer": {
    "name": "Ada Obi",
    "phone": "+2348012345678",
    "email": "ada@mail.com",
    "location": "Minna"
  },
  "items": [
    {
      "productId": "…",
      "color": "Black",
      "sizeBreakdown": { "40": 3, "41": 5, "42": 2 }
    }
  ],
  "instructions": "Matte black finish."
}
```

Custom variant: `type: "CUSTOM"`, items carry `footwearType`, `designImageUrl`, `colorNote`, `sizeBreakdown` (no `productId`).
On success: save → (CUSTOM) send quote emails now → return.

**Payments (Paystack test mode)**
| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/payments/paystack/initialize` | 🔓 + order token (or owner/admin session) | Body `{ reference, token? }` → creates Paystack transaction (amount from DB, kobo), sets `PENDING`, returns `{ authorizationUrl }` |
| GET | `/payments/paystack/verify?reference=&token=` | 🔓 + order token | Verifies with Paystack, checks amount/currency, marks `PAID` once, returns `{ orderReference, paymentStatus }` |
| POST | `/webhooks/paystack` | Signature (HMAC-SHA512 of raw body with secret key) | `charge.success` → mark `PAID` (idempotent) → send emails |

**Uploads**
| POST | `/uploads/design` | 🔓 rate-limited | multipart image (jpeg/png/webp ≤ 5 MB, magic-byte check) → Cloudinary → `{ url }` |

**Admin 🛡️**
`GET/POST /admin/categories` · `PATCH/DELETE /admin/categories/:id` · `GET/POST /admin/products` · `PATCH/DELETE /admin/products/:id` · `POST /admin/products/:id/images` · `PATCH /admin/products/:id/publish` · `GET /admin/orders?status=&type=&paymentStatus=&page=` · `GET /admin/orders/:id` · `PATCH /admin/orders/:id/status`

**Misc** 🔓 `GET /health`

Status codes: 200/201 · 400 · 401 · 403 · 404 · 409 · 413 · 415 · 422 · 429 · 500.

## 8. Key Flows

**A. Buy (catalogue):** Shop → Product → color → sizes + qty per size (running total, ₦ price) → Add to cart → Cart → **Checkout** (name, phone, email, location; sign in with Google optional) → **Place order** (saved, `UNPAID`) → **Pay with Paystack** → return to `/order/[reference]` → webhook/verify marks `PAID` → confirmation + admin emails sent → optional "Send on WhatsApp".

**B. Custom design:** Custom Design → type → upload image → color note → sizes/qty → instructions → submit → saved as quote request → "we'll contact you with a price" emails → PFC replies; later they can convert it to a priced order (Phase 2).

**C. Account:** Sign in with Google → `/account` shows past orders and status.

**D. Admin:** `/login` → Google → email ∈ `ADMIN_EMAILS` → dashboard (products, categories, orders with status update).

**WhatsApp message** (secondary; built once in `services/whatsapp.ts`):

```
Hello PFC, I placed order PFC-20261002-0042.
Product: PFC Classic Slide | Black
Size 40: 3 · Size 41: 5 · Size 42: 2 — Total 10 pairs
Name: Ada Obi | Phone: +234…
```

## 9. Security & Quality

- Validate every body/query with Zod; uploads by magic bytes, ≤ 5 MB, random names.
- `requireAdmin` enforced server-side. Cookie: `HttpOnly; Secure; SameSite=Lax`.
- **Verify Paystack webhook signature** on the _raw_ body (`express.raw` on that route); never trust redirect alone; handle duplicate webhooks idempotently.
- Rate-limit `/orders`, `/uploads`, auth routes. Helmet on. Secrets only in env.
- Emails run **after** the DB write and never fail the order; errors are logged.
- Mobile-first, alt text, contrast, `next/image`, metadata + sitemap.

## 10. Mailgun Without a Domain (answer to Q3)

Yes — use the **Mailgun sandbox domain** (`sandboxXXXX.mailgun.org`, given on signup).

1. Mailgun dashboard → Sending → Domain settings (sandbox) → **Authorized Recipients** → add your signup email (and the uncle's) → each person must click the confirmation link in the email Mailgun sends.
2. Use the sandbox domain + private API key in env. Emails to non-authorized recipients are rejected, which is fine for the demo: test with your own email.
3. In code: wrap sending in try/catch so a rejected recipient doesn't break checkout.
4. After HNG: add a real domain in Mailgun, add the DNS records, switch `MAILGUN_DOMAIN` and `MAIL_FROM`. No code change.

## 11. Deploy Once, Update the Same URL (answer to your deploy question)

Yes. This is the plan:

- **Vercel** (frontend) and **Render** (backend) connect to the GitHub repo and **auto-deploy every push to `main`**. The production URL never changes; each deploy replaces what's behind it.
- **First task of Phase 1 is deploying the empty skeleton** so you have a stable URL (`https://<name>.vercel.app`) to submit. Everything after that just ships to it.
- `develop` pushes get Vercel **preview URLs**, so you can test before merging to `main`.
- Rules to not break the live site: merge to `main` only when it works; run migrations with `prisma migrate deploy` in the Render build; keep env vars in the Vercel/Render dashboards.
- Heads-up: Render's free instance **sleeps after inactivity** (first request can take ~30–60 s). Open the site before any demo, or ping `/health` with a free uptime monitor.
- Add the production redirect URI in Google Cloud and the webhook URL in Paystack once the backend URL exists.

## 12. Environment Variables

`backend/.env.example`

```
NODE_ENV=development
PORT=8000
DATABASE_URL=            # Neon pooled
DIRECT_URL=              # Neon direct (migrations)
JWT_SECRET=
FRONTEND_URL=http://localhost:3000
ADMIN_EMAILS=samstarmichael@gmail.com
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=http://localhost:3000/api/v1/auth/google/callback   # goes through the frontend /api rewrite
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
MAILGUN_API_KEY=
MAILGUN_DOMAIN=          # sandbox domain for now
MAILGUN_REGION=us
MAIL_FROM=PFC <postmaster@sandbox….mailgun.org>
PFC_NOTIFY_EMAIL=
PAYSTACK_SECRET_KEY=     # sk_test_…
PAYSTACK_PUBLIC_KEY=     # pk_test_…
PFC_WHATSAPP_NUMBER=     # 234XXXXXXXXXX, no +
```

`frontend/.env.example`

```
BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_SITE_URL=http://localhost:3000
NEXT_PUBLIC_WHATSAPP_NUMBER=
```

## 13. Build Phases (re-planned for a 24-hour deadline)

**Rule:** the 4 HNG requirements come first. Each phase ends with a working, deployed feature on its own branch.

### Phase 0 — Plan ✅

- [x] Requirements reconciled, stack decided, contracts drafted

### Phase 1 — Foundation + First Deploy 🚀 ✅

- Step-by-step guide: `docs/phase-1-setup.md`
- [x] GitHub repo, `main` + `develop`, monorepo skeleton, commit `agent.md`
- [x] Neon project + Prisma schema + first migration
- [x] Express app with `/health`, env validation, error handler
- [x] Next.js + Tailwind + `/api` rewrite, basic layout
- [x] **Deploy both to Vercel/Render → stable live URL**
- **Done when:** the live frontend shows data from the live `/health` via the rewrite.

### Phase 2 — Catalogue ✅

- Step-by-step guide: `docs/phase-2-setup.md`
- [x] Seed categories (Shoes, Slides, Sandals, Slippers) + sample products with ₦ prices and placeholder images
- [x] Catalogue endpoints + Home, Shop (category filter), Product detail
- **Done when:** browse → category → product works with Neon data.

### Phase 3 — Google Auth ⭐ ✅

- Step-by-step guide: `docs/phase-3-setup.md`
- [x] OAuth flow, cookie session, `/auth/me`, logout, header login state
- [x] `ADMIN_EMAILS` role assignment, `requireAdmin`
- **Done when:** you can sign in on the live URL.

### Phase 4 — Cart + Checkout + Orders in DB ⭐ ✅

- Step-by-step guide: `docs/phase-4-setup.md`
- Scope: catalogue orders only; payment (Phase 6), emails (Phase 5), custom designs (Phase 9)
- [x] Color/size/qty configurator + running total, cart store
- [x] `POST /orders`, checkout page, order status page
- **Done when:** an order appears in Neon from the live checkout.

### Phase 5 — Mailgun ⭐ ✅

- Step-by-step guide: `docs/phase-5-setup.md`
- [x] Sandbox setup, templates (customer confirmation, admin notification)
- **Done when:** your signup email receives the confirmation.

### 🏁 SUBMISSION CHECKPOINT — Phases 1–5 live on `main`. Submit the URL here, then continue.

### Phase 6 — Paystack Test Payments (in progress)

- Step-by-step guide: `docs/phase-6-setup.md`
- [ ] Initialize, redirect, verify, webhook (signature + idempotent), payment status on order
- [ ] Emails fire on `PAID`
- **Done when:** a test-card payment flips an order to `PAID`.

### Phase 7 — Accounts

- [ ] `/account` order history; checkout prefill when signed in

### Phase 8 — Admin Dashboard

- [ ] Product + category CRUD, Cloudinary image upload, publish toggle, order list + status update

### Phase 9 — Custom Design Flow

- [ ] Custom page, upload, quote-request order, emails

### Phase 10 — Polish & Handover

- [ ] Remaining pages, WhatsApp button, SEO, accessibility, rate limits, real photos/content
- [ ] Verified Mailgun domain, Paystack live keys (when the business account is ready), admin guide
- [ ] Nodemailer (SMTP) as a second sender behind `sendEmail()` so emails can reach any customer (best with a domain mailbox)

## 14. Open Questions

**Answered**
| # | Question | Answer |
|---|---|---|
| Q1 | Google auth scope | Both admin and customers |
| Q2 | Real payment needed? | No → Paystack test mode |
| Q3 | Mailgun without domain | Sandbox + authorized recipients (§10) |
| Q4 | Prices | Naira |
| Q5 | Real content | None yet → placeholders |
| Q6 | Deadline / repo format | Tomorrow / none |
| Q7 | Stack | Express + Neon |

**Answered (round 2)**
| # | Question | Answer |
|---|---|---|
| Q8 | Admin Google email | `samstarmichael@gmail.com` (add the uncle's later) |
| Q9 | Mailgun signup + recipients | Same email for signup; test with it plus another of Samstar's own emails as authorized recipient |
| Q10 | Payment provider | Paystack |
| Q11 | WhatsApp number | Samstar's own number as placeholder for now |
| Q12 | HNG submission | Live URL + repo link only |
| Q13 | Custom designs | Quote requests only |
| Q14 | Delivery fee | Worked out after confirmation (none at checkout) |

**Still open:** nothing blocking. Real WhatsApp number, product photos, brand colors, and a domain are needed before the client goes live.

## 15. Decision Log

| ID  | Decision                                                                                                                                                                                                                              | Status                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------- |
| D1  | Web is the main channel; payments + accounts in scope; WhatsApp secondary                                                                                                                                                             | Decided                       |
| D2  | Express + TypeScript + Prisma backend (not FastAPI)                                                                                                                                                                                   | Decided                       |
| D3  | Neon for DB, Cloudinary for images                                                                                                                                                                                                    | Decided (Cloudinary proposed) |
| D4  | Monorepo `pfc-shop/` with `frontend/` + `backend/`                                                                                                                                                                                    | Decided                       |
| D5  | Same-origin `/api` rewrite, httpOnly cookie sessions                                                                                                                                                                                  | Proposed                      |
| D6  | Paystack test mode; webhook is source of truth                                                                                                                                                                                        | Decided                       |
| D7  | Custom order = `Order(type=CUSTOM)`, quote-only, no payment                                                                                                                                                                           | Decided                       |
| D13 | No delivery fee at checkout; fee worked out after confirmation                                                                                                                                                                        | Decided                       |
| D14 | Backend is ESM (`"type": "module"`, TS `NodeNext`, relative imports end in `.js`)                                                                                                                                                     | Decided                       |
| D15 | Code convention: a short line comment above each section of every code file                                                                                                                                                           | Decided                       |
| D16 | Google redirect URI points at the **frontend** domain (`…/api/v1/auth/google/callback`), proxied to Express, so the session cookie is first-party                                                                                     | Decided                       |
| D18 | Order access: guests view their order via a signed 30-day `token` link; owners/admins via session; unauthorized and missing orders both return 404                                                                                    | Decided                       |
| D19 | Cart lives in the browser (Zustand + localStorage); only product ids, colors and quantities go to the API, prices are recomputed server-side                                                                                          | Decided                       |
| D20 | Email via Mailgun HTTP API with `fetch` (no SDK, no Nodemailer). Mailgun env vars are optional so a missing key skips emails instead of crashing                                                                                      | Decided                       |
| D21 | Order emails are fire-and-forget after the order is saved; customer text is HTML-escaped; sandbox only reaches verified authorized recipients (max 5) until PFC has a verified domain                                                 | Decided                       |
| D22 | Checkout email is now REQUIRED (Paystack needs it; receipts go there)                                                                                                                                                                 | Decided                       |
| D23 | Payments: fresh payment reference per attempt; order id in Paystack metadata; webhook (HMAC-SHA512 on raw body) and callback-verify both call idempotent `settlePayment()`; PAID only if status success + NGN + amount = subtotal×100 | Decided                       |
| D24 | Payment covers items only; delivery fee confirmed separately by PFC                                                                                                                                                                   | Decided                       |
| D17 | Session JWT holds only the user id; role is read from the DB on every request (admin list changes apply on next login/request)                                                                                                        | Decided                       |
| D8  | Guest checkout allowed; Google account optional for customers                                                                                                                                                                         | Proposed                      |
| D9  | Server recomputes all prices/totals; snapshots on order items                                                                                                                                                                         | Decided                       |
| D10 | Emails never block order creation                                                                                                                                                                                                     | Decided                       |
| D11 | Deploy skeleton first; `main` auto-deploys to a stable URL                                                                                                                                                                            | Decided                       |
| D12 | Submission checkpoint after Phases 1–5                                                                                                                                                                                                | Decided                       |

## 16. Progress Log

| Date       | Phase | Done                                                                                                                                                                                                                 | Next                                                                                                        |
| ---------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| 2026-10-02 | 0     | Analyzed task + PRD, drafted v1 plan                                                                                                                                                                                 | —                                                                                                           |
| 2026-10-02 | 0     | v2: web-first, Express + Neon, payments/accounts added, 24h phase plan, new git workflow, Mailgun sandbox + deploy strategy                                                                                          | Phase 1: repo, branches, skeleton, first deploy                                                             |
| 2026-10-02 | 0→1   | All open questions answered; Phase 1 guide written (`docs/phase-1-setup.md`)                                                                                                                                         | Run Phase 1 steps, deploy, confirm /health through the live site                                            |
| 2026-10-02 | 1 ✅  | Repo + develop/main, Neon + Prisma migration, Express health route, Next.js skeleton deployed. Fixed rewrite 404 (BACKEND_URL trailing slash). Live: pfc-shop.vercel.app ↔ pfc-shop.onrender.com, health shows db up | Phase 2: seed + catalogue API + Home/Shop/Product pages                                                     |
| 2026-10-02 | 2 ✅  | Seed script, catalogue API, Home/Shop/Product pages shipped                                                                                                                                                          | Phase 3: Google OAuth, sessions, admin guard                                                                |
| 2026-10-02 | 3     | Phase 3 guide written (`docs/phase-3-setup.md`)                                                                                                                                                                      | Create Google OAuth client, add env vars, build `feat/google-auth`                                          |
| 2026-10-03 | 3 ✅  | Google sign-in working locally and live; fixed AuthProvider wrapping Header in layout.tsx                                                                                                                            | Phase 4                                                                                                     |
| 2026-10-03 | 4     | Phase 4 guide written (`docs/phase-4-setup.md`)                                                                                                                                                                      | Build `feat/orders-api`, then `feat/cart-checkout`; deploy; test an order on the live site                  |
| 2026-10-03 | 4 ✅  | Product configurator, cart, checkout, orders saved to Neon with server-side pricing, confirmation page + WhatsApp link, live                                                                                         | Phase 5                                                                                                     |
| 2026-10-03 | 5     | Phase 5 guide written (`docs/phase-5-setup.md`); HNG deadline extended                                                                                                                                               | Verify Mailgun recipients, build `feat/mailgun-emails`, deploy, then decide: submit now or do Phase 6 first |
| 2026-10-03 | 5 ✅  | Mailgun order confirmation + PFC notification working (sandbox, authorized recipients)                                                                                                                               | Phase 6                                                                                                     |
| 2026-10-03 | 6     | Phase 6 guide written (`docs/phase-6-setup.md`)                                                                                                                                                                      | Create Paystack test account, build `feat/paystack-payments`, set test webhook URL after deploy             |

## 17. Git Workflow

**Branches**

- `main` — production. Auto-deploys to the live URL. Only receives merges from `develop` when a core feature is built **and working**.
- `develop` — integration branch. Day-to-day work lands here.
- `feat/*` — one branch per feature, created from `develop`, merged back into `develop`.
- (Optional) `fix/*` for bug fixes, same flow as `feat/*`.

```
feat/catalogue-api ─┐
feat/google-auth   ─┼─► develop ──(feature works, tested)──► main ─► live deploy
feat/checkout-page ─┘
```

**Branch names:** `feat/project-setup`, `feat/catalogue-api`, `feat/catalogue-ui`, `feat/google-auth`, `feat/cart-checkout`, `feat/orders-api`, `feat/mailgun-emails`, `feat/paystack-payments`, `feat/account-orders`, `feat/admin-dashboard`, `feat/custom-design`, `feat/polish`.

**Commands**

```bash
# one-time
git checkout -b develop && git push -u origin develop

# start a feature
git checkout develop && git pull
git checkout -b feat/google-auth

# work + commit often (conventional commits)
git add . && git commit -m "feat(backend): add google oauth callback"
git push -u origin feat/google-auth

# merge into develop (PR feat/* → develop on GitHub, or locally)
git checkout develop && git merge --no-ff feat/google-auth && git push

# release to production when a core feature works
git checkout main && git pull && git merge --no-ff develop && git push
git checkout develop
```

**Rules**

- Never push broken code to `main`; test on the `develop` Vercel preview first.
- Commit messages: `feat(scope): …`, `fix(scope): …`, `docs: …`, `chore: …`.
- Update §13 checkboxes and §16 Progress Log in the same feature branch.
- Never commit `.env`; keep `.env.example` current.
- Protect `main` on GitHub (no direct pushes) once the deadline pressure is over.

## 18. Instructions for any AI agent working on this repo

1. Read this file fully before writing code.
2. Follow §5 folder structure and §7 API contract; if the contract must change, update this file first.
3. Work one phase at a time; stop at each "Done when".
4. Never trust client-supplied prices, totals or roles; verify Paystack webhooks.
5. After each session update the Decision Log and Progress Log.
