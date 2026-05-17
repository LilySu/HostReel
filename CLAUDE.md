# CLAUDE.md

This file is read by Claude Code at the start of every session. It defines what we're building, the stack, the rules, the design system, and the build checklist. Keep it up to date.

## Project Summary

A web app that lets short-term rental hosts (Airbnb, VRBO, etc.) turn walkthrough videos of a property into self-service check-in guides for guests. Hosts upload videos, organize them into named **sections** (e.g. "Check-in", "Weekly chores"), drop timestamp-pinned hotspots on the video timeline (wifi, washer, deck, trash, etc.), attach written instructions and optional photos to each, and share a public link. Guests open the link — no account needed — see a table-of-contents tree of sections with video thumbnails, watch any video, and tap hotspots to expand instructions inline. Both horizontal and vertical videos are first-class.

## Stack (do not deviate without asking)

- **Framework:** Next.js 14+ (App Router, TypeScript, `src/` not used — app at repo root)
- **Auth:** Clerk (`@clerk/nextjs`)
- **Database:** Postgres via `postgres-js` (Supabase managed; Transaction-pooler URL on port 6543 for runtime)
- **ORM:** Drizzle ORM + `drizzle-kit` for migrations
- **Storage:** Cloudflare R2 in production (`STORAGE_PROVIDER=r2`); local filesystem under `./storage/` for dev. Browser uploads bytes directly to storage via presigned PUT URLs — the app server never receives the video body.
- **Billing:** Stripe (Checkout + Customer Portal + webhooks). Plan state lives in Clerk `publicMetadata`; no new DB tables. App-managed 14-day trial set by Clerk's `user.created` webhook — Stripe is only involved when a user actually pays.
- **Email:** Resend (lazy init). In dev with no `RESEND_API_KEY`, invitation links are logged to the server console + returned in the API response so the host can copy/paste.
- **PDF generation:** `pdf-lib` (no headless browser). Receipts buffer in memory, written via `storage.save()` — receipts are small.
- **Static assets:** `./public/images/` (served at `/images/*`), imported via `next/image`
- **Styling:** Tailwind CSS with the Himara-inspired design tokens defined in `tailwind.config.ts` (see Design System below)
- **Fonts:** Cormorant Garamond (serif display + wordmark) via `next/font/google`; **Quattrocento Sans** (humanist sans body) loaded locally from `public/font/` via `next/font/local`. Quattrocento Sans only ships at weights 400 + 700 — Tailwind's `font-medium` (500) class falls back to 400 in this font, so use it sparingly or accept the lighter render.
- **UI primitives:** shadcn/ui (deferred to Phase 3 when Dialog/Sheet/Tabs are first needed)
- **Forms / validation:** React Hook Form + Zod
- **Markdown:** `react-markdown` + `remark-gfm`
- **Drag and drop:** `@dnd-kit/core` (for reordering videos and sections)
- **Video probing:** `fluent-ffmpeg` + system `ffmpeg` / `ffprobe`
- **Runtime:** Node 20+

## Hard Rules

1. **Always use Drizzle.** Never write raw SQL strings in route handlers or pages. If a query is too complex for Drizzle's query builder, add a helper in `lib/db/queries.ts`.
2. **Every host API route must call `requireUser()`** from `lib/auth.ts` and verify property ownership (via `clerkUserId`) before any mutation or read of host-private data. Public guest routes live under `/api/public/*` and `/api/media/*` and do not require auth.
3. **Never bypass the `StorageProvider` interface.** No direct `fs` calls in route handlers, server components, or server actions. All file I/O goes through `lib/storage/`.
4. **Validate every request body with Zod** before touching the DB. Validators live in `lib/validators.ts`.
5. **Run `npm run lint && npm run typecheck` before claiming a task complete.** If either fails, fix it before reporting back.
6. **No `any` types.** If you genuinely need to escape the type system, use `unknown` and narrow.
7. **No client-side validation as the only line of defense.** Client validation is for UX; server validation is mandatory.
8. **Timestamp columns use Postgres `timestamp with time zone` with `defaultNow()`.** Drizzle returns JS `Date` objects on read; pass `Date` on write. Don't store epoch ints.
9. **Slugs are generated with `nanoid` (URL-safe alphabet, length 10).** Regenerate on unpublish → republish.
10. **Cascade deletes via foreign keys** must also clean up files on disk via the `StorageProvider`. There is no orphan-file sweeper in v1.
11. **All colors, font sizes, radii, and shadows come from the design tokens** in `tailwind.config.ts` (extended palette + font families). Don't introduce one-off hex values, inline `style={{ color: '#...' }}`, or arbitrary `text-[14px]` in components. If a new token is needed, add it to the config and document it in the Design System section below.
12. **Static images live in `public/images/` and are rendered via `next/image`.** No raw `<img>` tags for assets we ship; no images under `app/` (Next.js treats those as route modules, not static files). User-uploaded media still goes through the `StorageProvider` and `/api/media/[...path]`.
13. **Drizzle migrations must be regenerated and committed when `schema.ts` changes.** Run `npm run db:generate`, review the SQL under `lib/db/migrations/`, then commit the schema + migration in the same commit.
14. **Large file uploads must use `storage.presignedUpload()`.** The server never receives video bytes. `storage.save()` is reserved for small server-generated artifacts (poster frames). The flow is: `POST /api/videos` → presigned URL → browser PUT → `POST /api/videos/[id]/finalize`.
15. **A successful PUT does not mean a video is ready.** The browser must call the matching `/finalize` route. Finalize is the only place duration/poster/status mutations happen.
16. **Any route importing `lib/storage/r2.ts` must declare `export const runtime = 'nodejs'`.** The AWS SDK does not work on the Edge runtime.
17. **Every video-creating code path calls `assertCanCreateVideo()` before the DB insert.** No exceptions. The helper no-ops when Stripe isn't configured (dev), so this rule is always safe to apply.
18. **Webhook routes verify their signing secret before any side effect.** Stripe uses `stripe.webhooks.constructEvent`; Clerk uses `svix`. No `setBilling()` calls happen until the signature is valid.
19. **Stripe webhook handlers must be idempotent.** Each handler checks `lastStripeEventId` on Clerk publicMetadata and bails if the event has already been processed.
20. **`stay_events` is append-only.** Never `UPDATE` or `DELETE` rows in this table. New events get inserted. This is the audit log.
21. **The server computes `hotspotContentHash`, IP, and user agent for stay events.** Never trust client-supplied values for these — hash content from the current DB row, read IP from `x-forwarded-for` server-side.
22. **Magic tokens are 32 chars from `randomBytes(24).toString('base64url')`.** Treat as bearer credentials — never log them in plain text outside secure debug logs.
23. **Guest stay routes (`/stay/*`, `/verify/*`, `/api/stay/*`) use stay-scoped session cookies, not Clerk.** Never call `requireUser()` in those routes. The cookie's stay id is the auth.
24. **Acknowledgment UI copy uses "acknowledge", "confirm", and "record" — not "sign a contract" or "legally binding".** The one exception is the typed-name step, framed exactly as "your typed name serves as your electronic signature confirming the acknowledgments above". We are *not* claiming ESIGN compliance or court-admissibility in v1.

## Design System — Himara hospitality aesthetic

The visual language is warm hospitality — think boutique hotel marketing site, not SaaS dashboard. Apply consistently across host and guest surfaces. The tokens below are authoritative; if a screen needs something not listed, extend the config rather than improvising.

### Palette

| Token (Tailwind) | Hex | Use |
|---|---|---|
| `cream` | `#FAF6EE` | Page background |
| `cream-dark` | `#F2EBDC` | Subtle banding, hover-fill on cream surfaces |
| `sand` | `#E8DFCB` | Default borders, dividers |
| `sand-light` | `#F0E9D8` | Soft borders, input outlines |
| `gold` | `#C8A876` | Primary accent: CTAs, links, focus rings, wordmark |
| `gold-dark` | `#A88B5C` | Gold hover/active |
| `charcoal` | `#2A2723` | Primary text, headings |
| `charcoal-light` | `#5A554D` | Secondary text |
| `white` | `#FFFFFF` | Elevated card surfaces |
| `red-700` (Tailwind default) | — | Reserved for destructive confirmations only; do not use for general accents |

### Type scale

- **Display / headings (`h1`, `h2`, marketing hero):** Cormorant Garamond (`font-serif`). Weights 400 / 500 / 600 / 700. Generous line-height (`leading-tight` for huge, `leading-snug` otherwise). Use sentence case, never ALL CAPS except for small overline labels.
- **Body & UI (`p`, buttons, inputs, table text):** Inter (`font-sans`). Default weight 400; medium (500) for buttons and labels.
- **Overline labels** (small section eyebrows like "Rooms"): `text-xs uppercase tracking-[0.18em] text-charcoal-light font-medium`.

### Borders & radii

- Default border: `border border-sand`. Cards/inputs use `border-sand-light` for an even softer edge.
- Radii: `rounded-md` (6px) for inputs and small cards. `rounded-lg` (8px) for content cards. `rounded-full` for pill CTAs and avatar chips. Avoid `rounded-xl`+ — too modern.
- Card shadow: prefer borders over shadows; use `shadow-sm` only on floating elements (modal, popover).

### Buttons

- **Primary CTA:** gold pill — `bg-gold text-white hover:bg-gold-dark rounded-full px-5 py-2.5 text-sm font-medium tracking-wide`. This is the "Book Online" energy.
- **Secondary:** cream ghost — `border border-sand bg-white text-charcoal hover:bg-cream-dark rounded-md px-4 py-2 text-sm font-medium`.
- **Destructive (reserved):** `border border-red-300 text-red-700 hover:bg-red-50` for the trigger; solid `bg-red-600 hover:bg-red-700 text-white` only inside the confirmation modal.

### Interactivity

Low-key, hospitality-luxe. No bouncy springs, no aggressive scaling on hover.

- Hover states: small color/opacity shifts only. No transforms larger than 1–2px translate or 1.01× scale.
- Transitions: `transition-colors duration-200` on hover-changing elements. `duration-300` for opacity fades on imagery overlays.
- No skeleton shimmer animations; use static cream placeholders.
- Focus: visible `ring-2 ring-gold/40 ring-offset-2 ring-offset-cream` on all interactive elements.

### Imagery

- Photography dominates. Heroes and section banners are full-bleed photographs with the headline overlaid (left-aligned, white or charcoal text depending on photo).
- Property and video cards lead with a photo, photo first, text second.
- Use `next/image` with `priority` on the landing hero only; let everything else lazy-load. Provide explicit `width`/`height` or a `fill` parent with a known aspect ratio so layout doesn't shift.
- Aspect ratios: landing hero 16:9 or wider, property cards 3:2, video poster matches the video itself (16:9 for horizontal, 9:16 for vertical — the host doesn't pick; the player and TOC adapt).

## File Structure

```
property-walkthrough/
├── app/
│   ├── layout.tsx                           # ClerkProvider, font CSS variables
│   ├── globals.css                          # Tailwind base + body font + bg
│   ├── (marketing)/
│   │   └── page.tsx                         # Landing (full-bleed hero)
│   ├── (host)/                              # Auth-gated
│   │   ├── layout.tsx                       # Host chrome (header, user button)
│   │   └── properties/
│   │       ├── page.tsx                     # Property list
│   │       ├── new/
│   │       │   ├── page.tsx
│   │       │   └── NewPropertyForm.tsx      # 'use client'
│   │       └── [propertyId]/
│   │           ├── page.tsx                 # Property detail + sections TOC
│   │           ├── PropertyActions.tsx      # 'use client' — rename, delete, modal
│   │           └── videos/[videoId]/edit/
│   │               └── page.tsx             # Hotspot editor (Phase 3)
│   ├── v/[slug]/page.tsx                    # Public guest view (Phase 4)
│   ├── sign-in/[[...sign-in]]/page.tsx      # Clerk catch-all
│   ├── sign-up/[[...sign-up]]/page.tsx      # Clerk catch-all
│   └── api/
│       ├── properties/
│       │   ├── route.ts                     # POST create, GET list
│       │   └── [id]/
│       │       ├── route.ts                 # PATCH rename, DELETE
│       │       └── publish/route.ts         # POST toggle publish (Phase 4)
│       ├── sections/
│       │   ├── route.ts                     # POST create
│       │   └── [id]/route.ts                # PATCH (rename, reorder), DELETE
│       ├── videos/
│       │   ├── route.ts                     # POST create record (with sectionId)
│       │   ├── [id]/route.ts                # PATCH, DELETE
│       │   └── upload/route.ts              # POST file upload
│       ├── hotspots/
│       │   ├── route.ts
│       │   ├── [id]/route.ts
│       │   └── [id]/photos/route.ts
│       ├── hotspot-photos/[id]/route.ts
│       ├── public/[slug]/route.ts
│       └── media/[...path]/route.ts
├── components/                              # Created in Phase 3+
│   ├── editor/
│   ├── guest/
│   └── ui/                                  # shadcn primitives (added in Phase 3)
├── lib/
│   ├── auth.ts
│   ├── slug.ts
│   ├── utils.ts                             # cn() helper
│   ├── validators.ts
│   ├── db/
│   │   ├── client.ts
│   │   ├── schema.ts                        # properties, sections, videos, hotspots, hotspot_photos
│   │   ├── queries.ts
│   │   ├── migrate.ts
│   │   └── migrations/                      # drizzle-kit output
│   ├── storage/
│   │   ├── provider.ts
│   │   ├── local.ts
│   │   └── index.ts
│   └── video/
│       ├── probe.ts
│       └── poster.ts
├── public/
│   └── images/                              # Static photography (see Image Registry)
├── storage/                                 # gitignored, user uploads
├── (data/ — no longer used; Postgres is remote)
├── drizzle.config.ts
├── middleware.ts
├── tailwind.config.ts
├── .env.local.example
└── package.json
```

## Data Model — Sections

Sections are a host-defined grouping of videos within a property. Examples: "Check-in", "Weekly chores", "Emergency". They show up as the top-level nodes in both the host's property detail TOC and the guest view.

- `sections` table: `id` (text, PK), `propertyId` (FK → properties, cascade), `title` (1–60 chars), `orderIndex` (int), `createdAt`.
- `videos.sectionId`: nullable FK → sections; if null, the video appears in an implicit "Unsorted" bucket at the end of the TOC. Hosts can drag videos between sections.
- Deleting a section sets its videos' `sectionId` to null (they fall back to "Unsorted") rather than cascading — losing footage when you delete a label would be bad UX.

## Build Phases — Track Progress Here

Tick boxes as you finish each task. Don't skip ahead — earlier phases unblock later ones.

### Phase 1 — Scaffolding ✓
- [x] Init Next.js 14 + TS + Tailwind, App Router, ESLint
- [x] Install Clerk; wrap root `app/layout.tsx` with `<ClerkProvider>`
- [x] Create `middleware.ts` protecting `(host)/*` and `/api/*` except `/api/public/*` and `/api/media/*`
- [x] Install Drizzle + `drizzle-kit` (initially `better-sqlite3`; later migrated to `postgres-js` + Supabase)
- [x] Create `lib/db/schema.ts` (properties, videos, hotspots, hotspot_photos)
- [x] Add indices: `videos.property_id`, `hotspots.video_id`, `properties.share_slug`, `properties.clerk_user_id`
- [x] Run initial migration against Supabase (`npm run db:migrate`)
- [x] Implement `StorageProvider` interface + `LocalStorageProvider`
- [x] Implement `/api/media/[...path]/route.ts` with `Accept-Ranges: bytes` support
- [x] *Skipped shadcn/ui in favour of small custom primitives in the Himara palette — same surface area (Button-ish CTAs, Input/Textarea fields, simple Dialog wrappers) without owning the maintenance of every shadcn component file.*

### Phase 2 — Property + section + video CRUD
- [x] Property list page (`/properties`) — server component reads via Drizzle
- [x] Create property form + `POST /api/properties` (generates `shareSlug`)
- [x] Rename + delete property
- [x] Property detail page (`/properties/[propertyId]`)
- [x] **Sections schema migration** — `sections` table + `videos.sectionId` FK (FK set-null enforced in app code; see note in `app/api/sections/[id]/route.ts`)
- [x] **Sections API** — `POST /api/sections`, `PATCH /api/sections/[id]` (rename + orderIndex), `DELETE /api/sections/[id]` (sets child videos' sectionId to null)
- [x] **Sections UI on property detail** — create, rename, delete, tree-view TOC layout (reorder UI deferred; orderIndex is PATCH-settable)
- [x] `POST /api/videos` (creates record with status `uploading`, takes `sectionId`; orderIndex per-section)
- [x] `POST /api/videos/upload` — *superseded by the three-step presigned flow (POST /api/videos returns presigned URL → browser PUT → POST /api/videos/[id]/finalize). The old multipart route is gone.*
- [x] Reject if MIME not `video/mp4` or `video/quicktime`
- [x] Reject if duration > 300s (delete file, set status `failed`, return 400)
- [x] Reject if file > 500 MB
- [x] Generate poster from first frame via ffmpeg; preserve source aspect ratio (failure non-fatal)
- [x] Set video status `ready` on success
- [x] Video reorder within a section via ChevronUp/Down buttons (PATCH orderIndex; swap with neighbor). dnd-kit deferred — arrow buttons cover the same ground without a library.
- [x] Video rename, delete (cascade clean up files via storage.delete)
- [x] Section reorder via ChevronUp/Down (PATCH orderIndex)
- [x] Property cover image upload (`POST /api/properties/[id]/cover`)

### Phase 3 — Hotspot editor ✓
- [x] `/properties/[propertyId]/videos/[videoId]/edit` page
- [x] `HotspotEditor` shell: video left, hotspot list right
- [x] Clickable timeline with hotspot markers below the video
- [x] "Add hotspot at current time" CTA with the timestamp formatted in the button label
- [x] Inline details form: title, icon picker (7 lucide icons), Write/Preview tabs on markdown instructions, photo grid (1–3)
- [x] `POST /api/hotspots`, `PATCH /api/hotspots/[id]`, `DELETE /api/hotspots/[id]`
- [x] Inline editable timestamp (mm:ss input with parse + clamp)
- [ ] Drag-to-adjust timestamp on the timeline *(timeline click-to-scrub ships; drag the marker itself is deferred)*
- [x] Photo upload: `POST /api/hotspots/[id]/photos` (presigned), `DELETE /api/hotspot-photos/[id]`. Drag-and-drop too.
- [x] Save-on-blur autosave + "Saved Xs ago" indicator in the editor header
- [x] Keyboard shortcuts: Space, ←/→ (Shift = ±1s), `,` / `.` for ~frame-step, M to mark, ↑↓ to navigate, ?  for the cheat sheet
- [x] Quick-add template chips above the list (Wifi / Trash / Washer / Dishwasher / Thermostat / Parking / Check-out)
- [x] Bulk "Mark all required" / "Clear all" for Stays setup

### Phase 4 — Publish + guest view ✓
- [x] Publish toggle on property detail → `POST /api/properties/[id]/publish`
- [x] Regenerate `shareSlug` on draft → published transition (so an unpublish + republish kills the previous link)
- [x] `GET /api/public/[slug]` returns property + sections + videos (ready only) + hotspots + photo URLs
- [x] `/v/[slug]` public page — TOC, video player, hotspot list
- [x] Player handles both 16:9 (full width) and 9:16 (max-w-xs centered)
- [x] Playhead-crossing toast: chip top-right with title, 4s auto-dismiss, tap to expand
- [x] Hotspot detail panel inline-expand (sheet/dialog split deferred — same content, less ceremony)
- [x] Hotspot list browsable independent of playback (click row → seek + expand)
- [x] Open Graph image (dynamic 1200×630 ImageResponse) + Twitter card meta + noindex
- [x] Share button with QR code (on /properties detail) + native share + copy-link fallback on /v/[slug]

### Phase 4.5 — Billing (Stripe) ✓
- [x] Lazy-init Stripe client + plan limits in `lib/billing.ts`
- [x] `POST /api/stripe/checkout`, `POST /api/stripe/portal`
- [x] `POST /api/stripe/webhook` with signature verify + idempotency on `lastStripeEventId`
- [x] `POST /api/clerk/webhook` (svix) sets up the 14-day app-managed trial on `user.created`
- [x] `/billing` page with plan badge, usage bar, plan-aware CTAs
- [x] Quota gate on `POST /api/videos` returns 402 with typed `BillingLimitResponse`; upload UI shows upgrade dialog
- [x] Stays gated to Pro via `assertCanCreateStay()`; invite form renders an upgrade prompt for trial users
- [x] Nav badge in host header when trial has ≤3 days left or status is `past_due`

### Phase 4.7 — Stays (verified guest check-in with audit trail) ✓
- [x] `stays` + `stay_events` (append-only) tables + `hotspots.required_acknowledgment`
- [x] `lib/stays/{token,hash,session,email,pdf,copy,request}.ts`
- [x] Host invite: `POST /api/stays`, `GET /api/stays`, `GET /api/stays/[id]`, `POST /api/stays/[id]/resend`, `PATCH` (mark expired), `GET /api/stays/export` (CSV)
- [x] Guest flow: `/stay/[token]` consent + session cookie → `/walkthrough` acknowledgment UI → `/complete` signature → `/done` receipt
- [x] `POST /api/stay/consent`, `POST /api/stay/event` (server-computed hash/IP/UA + snapshot fields), `POST /api/stay/complete` (PDF + audit hash)
- [x] `/verify/[stayId]` public verification page (no PII beyond first name)
- [x] Spreadsheet-style host dashboard with per-hotspot cells, status pills, drawer with audit log, per-row actions menu, sticky first column, CSV export

### Phase 5 — Polish ✓
- [x] Empty states (no properties, no sections — suggested chips, no videos, no hotspots, no stays)
- [x] Error boundary on host pages + global `not-found`
- [x] Marketing landing `/demo` sample tour
- [x] PWA manifest
- [x] Property cover image upload
- [x] README rewritten end-to-end (setup, env, ffmpeg, deployment)
- [x] `.env.local.example` covers Clerk + Supabase + R2 + Stripe + Resend + AUDIT_HMAC_KEY
- [ ] Mobile QA: iOS Safari 15+, Android Chrome — *needs real device testing, not automatable*
- [ ] Skeleton placeholders on Stays drawer — currently shows plain "Loading…"

## Validation Rules (must match `lib/validators.ts`)

| Field | Rule |
|---|---|
| `property.name` | string, 1–80 chars |
| `section.title` | string, 1–60 chars |
| `video.title` | string, 1–60 chars |
| Video MIME | `video/mp4` or `video/quicktime` |
| Video extension | `.mp4` or `.mov` |
| Video duration | ≤ 300 seconds (server-checked via ffprobe) |
| Video file size | ≤ 500 MB |
| `hotspot.title` | string, 1–40 chars |
| `hotspot.instructionsMd` | string, 0–2000 chars (empty allowed; "soft warnings, not errors" per UX brief) |
| `hotspot.timestampSeconds` | integer, `0 ≤ t ≤ video.durationSeconds` |
| `hotspot.icon` | one of: `wifi`, `appliance`, `outdoor`, `trash`, `key`, `parking`, `other` |
| Hotspot photos | ≤ 3 per hotspot, each ≤ 5 MB, MIME `image/jpeg`, `image/png`, or `image/webp` |
| `shareSlug` | 10-char nanoid, URL-safe alphabet |

## Out of Scope for v1 (do not build)

- S3 / R2 / Cloudflare Stream / Mux integration (interface is ready, swap later)
- Background job queue — transcoding/probing is synchronous and acceptable with 5-min cap
- Adaptive bitrate streaming — single MP4 with range requests is fine
- Email notifications
- Analytics dashboards
- Guest link expiry
- Multi-user collaboration on the same property
- Address fields on properties (handled by a separate system)
- Custom auth — Clerk handles all of it
- Section "kinds" / preset types — sections are freeform titles only in v1

## System Dependencies

- Node 20+
- `ffmpeg` and `ffprobe` on PATH
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt-get install -y ffmpeg`
  - Windows: `winget install ffmpeg` or download from ffmpeg.org

## Billing model

- One paid plan: **Pro**. Stripe Price ID lives in `STRIPE_PRO_PRICE_ID`.
- **14-day trial** is app-managed (no card required upfront). Set by the `user.created` Clerk webhook into `publicMetadata.trialEndsAt`. Stripe is uninvolved until checkout.
- **Quota: total video count across all of the user's properties.** Trial = 20, Pro = 100, past_due/canceled = 0 (read-only). Limits live in `PLAN_LIMITS` in `lib/billing.ts` — change there, not in routes.
- **Single source of truth:** Clerk `publicMetadata.plan`. Stripe webhook → `setBilling()` → Clerk.
- The `assertCanCreateVideo()` gate is a no-op when `STRIPE_SECRET_KEY` is unset, so local dev without Stripe stays usable.
- Quota check is racy under concurrent uploads (worst case: +1 over limit). Accepted for v1.

## Stays — invitation-only verified check-in

Separate from and additive to the public `/v/[slug]` share link. The public link is casual; a Stay is formal — one guest per invitation, every action recorded in `stay_events` (append-only).

- **Magic-link auth model:** the host invites a guest by email. The guest opens `/stay/[token]`, accepts a consent paragraph, and is issued a `stay_session` cookie scoped to `/`. From then on the cookie's stay id is the authorization for `/api/stay/*` and `/stay/*`. No Clerk session is involved on the guest side.
- **Required vs optional hotspots:** `hotspots.required_acknowledgment` (boolean, default false). On a Stay, required hotspots must each receive a `hotspot_acknowledged` event before the guest can complete check-in. Optional hotspots behave like the public-share-link view.
- **Audit hash:** `lib/stays/hash.ts` computes an HMAC over the full event chain at completion time. Key lives in env (`AUDIT_HMAC_KEY`); in dev the lib falls back to a per-process random key with a loud warning. To rotate the key, version it alongside each stay — never delete an old key, or you lose verifiability.
- **Dashboard expectations:** `/properties/[id]/stays` is a per-guest grid. Cells reflect **historical acknowledgments**, not "is this hotspot currently required." If a host changes a hotspot from required → optional after some guests acknowledged it, the historical ✓ stays in those guests' rows.
- **Pricing gating (TBD):** Stays is a more valuable feature than the public share link. Whether to gate it behind Pro (with a trial cap), include it in Pro at no extra meter, or charge separately is an open product question — see the brief.

## Security Note — Media URLs

R2 public URLs are **public-by-knowledge**: the storage key is the only access control. Slugs are unguessable (nanoid, URL-safe alphabet), but URLs leak via screenshots, link previews, mistakenly-public document shares, etc. This is the same threat model as S3 presigned URLs. Acceptable for v1 because:

- Uploaded content is intentionally guest-facing (check-in instructions); the assumption is "anyone who has the share link is welcome to see it."
- Nothing sensitive (payment data, PII beyond a host's first name) is ever stored in R2.

Do not put anything in R2 that you wouldn't put on the same URL behind a public CDN.

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in Clerk keys from the Clerk dashboard. The other defaults work for local development.

- **`DATABASE_URL`** must be Supabase's Transaction-pooler URL (port 6543) for runtime — the pooler is what handles serverless connection spikes. Migrations need a session-style connection, but the `npm run db:migrate` script automatically rewrites the URL (swaps `:6543/` → `:5432/` and strips `?pgbouncer=true`), so set `DATABASE_URL` to the pooler URL only.
- URL-encode special characters in the password (e.g. `@` → `%40`).
- **`STORAGE_PROVIDER`** defaults to `local` (filesystem under `STORAGE_DIR`). Set to `r2` in production along with `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`. R2 reads are lazy — local dev never needs these vars set.
- **R2 CORS** must allow `PUT`, `GET`, `HEAD` from your app origin, expose `ETag`, and the bucket must be publicly readable for the `R2_PUBLIC_URL` to serve media.

## Commands

```bash
npm run dev              # start dev server
npm run build            # production build
npm run start            # run production build
npm run lint             # eslint
npm run typecheck        # tsc --noEmit
npm run db:generate      # drizzle-kit generate
npm run db:migrate       # apply migrations to data/app.db
npm run db:studio        # drizzle-kit studio
```

## Image Registry — `public/images/`

Curated Unsplash photography used as placeholders until real host content arrives. File names are the original Unsplash slugs (photographer + ID) to preserve attribution.

### Landing & hospitality (hero / property covers)
| File | Orientation | Role |
|---|---|---|
| `aes-a7Cf-p-ShfA-unsplash.jpg` | landscape, 6240×4160 | **Landing hero** — bright bedroom, soft light |
| `hans-eKu4SWDa2jE-unsplash.jpg` | landscape, 6163×4109 | Property cover — wooden slat headboard, hanging robes (boutique-hotel vibe) |
| `filios-sazeides-uckPy5B7K4o-unsplash.jpg` | landscape, 5910×3945 | Property cover — warm bedroom with orange curtain |
| `zoshua-colah-q1lknm19EtU-unsplash.jpg` | landscape, 6000×4000 | Property cover — living room with TV, dining nook |
| `adrian-schwarz--QQwV-lU2_4-unsplash.jpg` | landscape, 4071×2719 | Property cover — covered porch with chair |
| `mick-kirchman-C3jvrLq1Qf0-unsplash.jpg` | portrait, 4000×6000 | Property cover (vertical) — dark cozy lounge, evening |
| `aes-reuIAvaxUMk-unsplash.jpg` | portrait, 4160×6240 | Property cover (vertical) — white kitchen |
| `kelcie-papp-YVGtHXF6qZg-unsplash.jpg` | portrait, 3045×4567 | "Views / neighborhood" — window view |

### Video covers — by likely section type
| File | Orientation | Suggested section/video |
|---|---|---|
| `jon-tyson-XS_o-Iuf9Go-unsplash.jpg` | portrait, 3024×4032 | **Welcome / Check-in** — "Be Our Guest" doormat |
| `julia-shypka-ua1pO52YKDA-unsplash.jpg` | portrait, 4000×6000 | **Dishwasher** — open dishwasher with kettle |
| `jackson-barger-vXqPc-xLQlE-unsplash.jpg` | landscape, 4248×2390 (16:9) | Kitchen / fridge walkthrough (horizontal) |
| `abdullah-ahmad-Qd_XOtnPmnQ-unsplash.jpg` | portrait, 3776×5925 | Fridge / freezer (dark, vertical) |
| `denise-jans-1Mhx0_UUcaQ-unsplash.jpg` | portrait, 3080×5472 | Fridge — hand grabbing item |
| `erik-mclean-F5G4YTN5uEQ-unsplash.jpg` | portrait, 3648×5472 | Fridge with bottles |
| `brandon-griggs-khAgMiA7duA-unsplash.jpg` | portrait, 4160×6240 | **Trash day** — row of bins (preferred) |
| `chris-lynch-HrQzQuqBWGI-unsplash.jpg` | portrait, 3819×5729 | Trash — green dumpster in alley |
| `claudio-schwarz-wl8sxkzMwRg-unsplash.jpg` | landscape, 8640×5760 | Trash — bags against stone wall (horizontal) |
| `anastasiia-nelen-GpY5mwbVNCo-unsplash.jpg` | portrait, 4002×6000 | Trash — sorting bins, transit setting |
| `markus-spiske-RGReOlU-n04-unsplash.jpg` | landscape, 3500×2333 | Trash — street bags with graffiti |

The landing hero (`aes-a7Cf-p-ShfA`) is reserved for the marketing landing only; pick a different property-cover image for any other prominent surface.
