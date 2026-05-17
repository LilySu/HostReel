# HostReel

A web app for short-term rental hosts to turn property walkthrough videos into self-service check-in guides for guests. Hosts upload videos, drop timestamp-pinned hotspots at specific moments (wifi, washing machine, trash, etc.), and share a public link. Optionally, they can run a **verified check-in** by inviting a specific guest by email — the guest reviews the walkthrough, acknowledges each required item, types their name as a signature, and the host gets a PDF receipt with an audit trail.

## Stack

- **Framework:** Next.js 14 (App Router, TypeScript)
- **Auth:** Clerk (`@clerk/nextjs`)
- **Database:** Supabase Postgres via `postgres-js` (Transaction-pooler URL)
- **ORM:** Drizzle ORM + `drizzle-kit`
- **Storage:** Cloudflare R2 in production; local filesystem for dev. Browser uploads bytes directly to storage via presigned PUT URLs — the app server never receives video bodies.
- **Billing:** Stripe (Checkout + Customer Portal + webhooks). Plan state lives in Clerk publicMetadata.
- **Email:** Resend + lightweight inline HTML templates
- **PDF receipts:** `pdf-lib` (no headless browser)
- **Styling:** Tailwind CSS with the Himara-inspired hospitality design tokens
- **Fonts:** Cormorant Garamond (serif) + Inter (sans)
- **Video probing/poster extraction:** `fluent-ffmpeg` + system `ffmpeg`/`ffprobe`

See `CLAUDE.md` for the hard rules, design system, and build phase tracker.

## Prerequisites

- **Node 20+**
- **`ffmpeg` and `ffprobe`** on PATH:
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install -y ffmpeg`
  - Windows: `winget install ffmpeg` (or download from ffmpeg.org)
- **A Clerk account** (free tier): https://clerk.com
- **A Supabase project** (free tier): https://supabase.com — for the Postgres database
- **A Cloudflare account** (free tier): https://cloudflare.com — for R2 in production (optional in dev)
- **A Stripe account** (test mode is fine): https://stripe.com — optional; without it the billing gate is a no-op
- **A Resend account** + verified sender domain: https://resend.com — optional; without it Stays invitation links log to the console for manual copy/paste

## Setup

```bash
# 1. Install deps
npm install

# 2. Copy env template and fill in the required values
cp .env.local.example .env
```

The bare minimum to run locally:

```ini
# Clerk — Project Settings → API Keys
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=
CLERK_SECRET_KEY=

# Supabase Transaction-pooler URL (port 6543).
# Find at: Project Settings → Database → Connection string → "Transaction" tab.
# URL-encode special chars in the password (e.g. @ → %40).
DATABASE_URL=postgresql://postgres.PROJECTREF:PASSWORD@aws-1-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true

# Storage — 'local' (default, no R2 creds needed) or 'r2'
STORAGE_PROVIDER=local
STORAGE_DIR=./storage

# App
PUBLIC_BASE_URL=http://localhost:3000
```

Then:

```bash
# 3. Generate and apply migrations to Supabase
npm run db:migrate

# 4. Start dev server
npm run dev
```

Open http://localhost:3000.

### Optional pieces

- **R2 in dev** — set `STORAGE_PROVIDER=r2` plus `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. Configure CORS on the bucket to allow `PUT`/`GET`/`HEAD` from `http://localhost:3000` and `ExposeHeaders: ETag`.
- **Stripe** — set `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRO_PRICE_ID`, plus `CLERK_WEBHOOK_SECRET` for the user.created webhook that sets up the 14-day trial. For local dev, use `stripe listen --forward-to localhost:3000/api/stripe/webhook` and `ngrok http 3000` to expose the Clerk webhook.
- **Resend** — set `RESEND_API_KEY` + `RESEND_FROM_EMAIL`. Without these, Stays invitation links are logged to the server console and surfaced in the API response.
- **Audit HMAC** — `AUDIT_HMAC_KEY` for the Stay audit hash. Generate via `openssl rand -base64 48`. Without it, the lib falls back to a per-process random key with a loud warning; stays completed before a restart won't verify after.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start dev server on `:3000` |
| `npm run build` | Production build |
| `npm run start` | Run production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:generate` | Generate Drizzle migrations from `lib/db/schema.ts` |
| `npm run db:migrate` | Apply migrations to the database (rewrites the pooler URL to port 5432 automatically) |
| `npm run db:studio` | Open Drizzle Studio in the browser |

## Project layout

```
app/
├── (marketing)/page.tsx          Landing page (full-bleed hero)
├── (host)/                       Auth-gated host surfaces
│   ├── billing/                  Plan + usage + Stripe portal
│   ├── properties/               List, detail, hotspot editor, preview, stays
│   └── error.tsx                 Friendly error boundary for host pages
├── stay/[token]/                 Guest magic-link flow (consent → walkthrough → complete → done)
├── v/[slug]/                     Public guest view of a published property
├── verify/[stayId]/              Public Stay verification page
└── api/                          Hand-typed routes
    ├── properties/ sections/ videos/ hotspots/ hotspot-photos/
    ├── public/[slug]/            Guest API
    ├── media/[...path]/          Local-mode media streaming
    ├── upload-local/[token]/     Local-mode HMAC-signed presigned uploads
    ├── stripe/{checkout,portal,webhook}
    ├── clerk/webhook             user.created → trial init
    ├── stays/ stay/{consent,event,complete}/
    └── ...

lib/
├── auth.ts slug.ts utils.ts validators.ts
├── billing.ts                    Plan state + quota gates
├── db/                           schema + client + queries + migrate
├── storage/                      provider / local / r2 / index
├── video/                        probe + poster
└── stays/                        token + hash + session + email + pdf + copy
```

## Architecture notes

- **Storage is pluggable.** All media goes through `lib/storage/provider.ts`. Switching production from local to R2 is one env var: `STORAGE_PROVIDER=r2`. R2 reads are lazy, so importing the index never fails when only local is configured.
- **Auth is fully outsourced to Clerk on the host side.** We store only `clerk_user_id` as a foreign key. No users table. Guest stays use stay-scoped session cookies instead.
- **Browser uploads bypass the server.** A presigned PUT URL is issued by `POST /api/videos`; the browser PUTs the bytes directly to R2 (or to a local same-origin route in dev), then calls `POST /api/videos/[id]/finalize` to trigger server-side probing + poster extraction.
- **Billing state is one source of truth.** Plan, trial expiry, and Stripe subscription ID all live in Clerk publicMetadata. Stripe webhook → `setBilling()` → Clerk.
- **The Stay audit log is append-only.** `stay_events` rows are inserted, never updated. The signing HMAC key (`AUDIT_HMAC_KEY`) should be rotated by versioning, not replacement, to keep old hashes verifiable.

## Deployment

This app is designed to deploy on serverless hosts (Vercel, Cloudflare Pages, Fly Machines) as long as:

1. **R2** is configured for storage (`STORAGE_PROVIDER=r2`)
2. **Supabase** holds the DB (pooler URL for runtime)
3. **`ffmpeg`** is available at runtime — the finalize route needs it.
   - On Vercel, use a build image with ffmpeg or vendor it via `@ffmpeg-installer/ffmpeg`.
   - On Fly, use the standard Node image and `apt-get install -y ffmpeg` in the Dockerfile.
4. **`PUBLIC_BASE_URL`** matches the production origin (used for share + invite links).
5. **`AUDIT_HMAC_KEY`** is set to a stable secret (32+ random bytes, base64-encoded). Never delete or rotate without versioning if Stays have been signed.

## License

Internal — not published.
