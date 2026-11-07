# Space Basic: architecture (Step 2)

**Status:** adopted. The open questions were decided on 2026-11-07 (§12). This doc is written in go mode; the user will review it later. Schemas are in `docs/schemas.md`, the endpoint table in `docs/api.md`, and every decision with its date in `docs/decisions.md`.

**Scope:** Phase 1 in detail, plus how Phase 2+ modules slot in without breaking changes.

## 1. Overview

```
 Phone / desktop browser (installed PWA)
 ┌──────────────────────────────────────────────┐
 │ React + Vite SPA (client/)                   │
 │  access JWT in memory · theme/device prefs   │
 │  in localStorage · service worker caches     │
 │  the app shell only, never API data          │
 └──────────────┬───────────────────────────────┘
                │ HTTPS, same origin: https://<app>.vercel.app
                │   /*        → static SPA (index.html fallback)
                │   /api/*    → Vercel rewrite (server-side proxy)
 ┌──────────────▼───────────────────────────────┐
 │ Vercel edge: static hosting + rewrite        │
 └──────────────┬───────────────────────────────┘
                │ HTTPS → https://<api>.onrender.com/api/*
 ┌──────────────▼───────────────────────────────┐
 │ Express API (server/), Render free tier      │
 │  helmet · CORS allow-list · rate limits      │
 │  · auth · tenant scope · RBAC · zod          │
 │  validation · module routers under /api/v1   │
 └──────────────┬───────────────────────────────┘
                │ TLS, least-privilege DB user
 ┌──────────────▼───────────────────────────────┐
 │ MongoDB Atlas (one database, shared          │
 │ collections, every tenant document carries   │
 │ institutionId)                               │
 └──────────────────────────────────────────────┘
 Outbound only: Gmail API over HTTPS (email OTP in production)
```

**Why the rewrite matters.** The browser only ever talks to the Vercel origin. That makes the refresh cookie **first-party** (SameSite=Lax works), removes CORS from the browser path, and avoids third-party-cookie blocking. The server still keeps a CORS allow-list as defence in depth, for direct calls.

**Cold starts.** Render's free tier sleeps and can take up to about a minute to wake.

- The client shows its normal loading state, and the API client **retries once** on a network error, 502/503/504 or timeout.
- The first request after launch uses a 75 s timeout; later requests use 20 s.
- Vercel's rewrite proxy has its own upstream timeout. This is verified at the deploy step. If a cold start exceeds it, the client's single retry covers it.
- `GET /api/v1/health` is cheap. The client calls it on app start to wake the server early.

## 2. Repository layout

npm workspaces (built into npm, no new tool) with three packages. TypeScript `strict` everywhere, with project references.

```
/
├─ package.json            # "workspaces": ["client", "server", "shared"]; root scripts only
├─ tsconfig.base.json      # strict, shared compiler options
├─ shared/                 # @spacebasic/shared: the ONE place for schemas and API types
│  └─ src/
│     ├─ schemas/<module>.ts   # zod request/response schemas per module (server validates, client reuses)
│     ├─ api/<module>.ts       # inferred request/response types (z.infer), route paths
│     ├─ roles.ts              # role list + permission map (§5)
│     ├─ modules.ts            # module registry: keys, titles, phase status (§7)
│     ├─ hostel.ts             # room-code pattern ^(CF|CS|CT)\d{3}$ (data-driven, see step 3)
│     └─ errors.ts             # error codes shared by server responses and client messages
├─ server/
│  └─ src/
│     ├─ app.ts            # builds the Express app (no listen); used by Supertest
│     ├─ server.ts         # connect DB + listen
│     ├─ config/env.ts     # zod-validated env; fails fast at startup; dev/test/prod profiles
│     ├─ core/
│     │  ├─ http/          # AppError types, central error handler, 404, requestId, async wrapper
│     │  ├─ middleware/    # authenticate, requireRole/requirePermission, requireModule, validate(zod), tenant, rateLimit presets, sanitize
│     │  ├─ db/            # mongoose connection, tenantScope plugin, audit-log writer
│     │  └─ security/      # tokens (access JWT, refresh, QR), hashing (bcrypt, HMAC), cookie options
│     ├─ modules/          # ONE FOLDER PER MODULE
│     │  ├─ auth/          # login (password/OTP), refresh, logout, forgot/reset, change password
│     │  ├─ users/         # me, profile, avatar upload
│     │  ├─ consent/       # record, view, withdraw (DPDPA)
│     │  ├─ hostel/        # hostel → floor → room (admin writes, read for profile)
│     │  ├─ notifications/ # list, unread count, mark read; createNotification() service for other modules
│     │  ├─ attendance/    # QR token issue, scan/verify, attendance log
│     │  ├─ support/       # contacts + FAQ (read); admin writes via API
│     │  ├─ institutions/  # institution record, logo, enabled modules (admin/super_admin)
│     │  └─ audit/         # audit log (write via service; read for admins later)
│     │     └─ <module>/ model.ts · service.ts · controller.ts · routes.ts · index.ts · <module>.test.ts
│     ├─ providers/otp/    # OtpDelivery interface + console, gmail-api, gmail-smtp
│     └─ scripts/          # seed (dev only, refuses in production), import-csv, create-institution
├─ client/
│  ├─ index.html · vite.config.ts · vercel.json (SPA fallback + /api rewrite)
│  ├─ public/              # PWA icons, manifest (PWA step)
│  ├─ src/
│  │  ├─ main.tsx
│  │  ├─ app/              # App shell, router, providers (auth, theme, query), ErrorBoundary, route guards
│  │  ├─ styles/           # tokens.css (light + dark sets), base.css, fonts (Plus Jakarta Sans, latin)
│  │  ├─ components/       # reusable UI built only from tokens: Button, TextField, SegmentedControl,
│  │  │                    # Card, ListRow, Toggle, BetaPill, Header, BackButton, TabBar, BottomSheet,
│  │  │                    # Avatar, CameraBadge, Icon (Phosphor + cut-out SVGs), ComingSoon
│  │  ├─ features/         # ONE FOLDER PER MODULE (mirrors server/modules)
│  │  │  ├─ auth/ home/ notifications/ support/ profile/ settings/ consent/ attendance/
│  │  │  │  └─ <feature>/ pages/ · components/ · api.ts · hooks.ts · index.ts (routes + registry entries)
│  │  ├─ config/           # quickActions.ts (third chip label "Book meal" as ONE constant), build info
│  │  └─ lib/              # apiClient (token, refresh, retry-once), device info, haptics, sounds, dates (Intl)
│  └─ tests/
│     ├─ unit/             # logic tests
│     ├─ visual/           # Playwright per-screen visual tests (Docker only)
│     └─ fixtures/         # fake screenshot data (committed) · private/ (real data, gitignored)
├─ tools/ui-analysis/      # measurement tooling (exists)
└─ docs/                   # ui-measurements.md, architecture.md, not-from-reference.md, api.md (step 4)
```

**Config separation.**

- **Server:** `.env.development` and `.env.production` (neither committed), plus `.env.example`, which documents every variable.
- **Client:** only non-secret `VITE_*` values, such as `VITE_API_BASE=/api/v1`.
- **Build info:** version, bundle id and build time are injected at build time through Vite `define` and shown in Settings.
- **Production secrets** live in the Vercel and Render dashboards.

## 3. Request data flow (server)

```
request
 → requestId → helmet → CORS allow-list → body-size limit (100 kB JSON; avatar upload has its own limit)
 → sanitize (strip $-prefixed / dotted keys from body, query and params against NoSQL injection)
 → rate limit (global preset; tighter presets on auth/OTP routes)
 → router /api/v1/<module>
    → authenticate         (verify access JWT → req.ctx = { userId, institutionId, roles, sessionId })
    → requireModule(key)   (module enabled for this institution?)
    → requirePermission(p) (RBAC, §5)
    → validate({ body, query, params } zod schemas from @spacebasic/shared) → typed req.valid
    → controller → service (business logic) → model (tenant-scoped, §6)
 → central error handler → { error: { code, message, fields?, requestId } }  (no stack traces in production)
```

**Logging.** Request line plus `requestId`. Bodies are never logged. Passwords, OTPs, tokens and password hashes are never logged or returned. `toJSON` transforms on the models strip secret fields as a second safety net.

## 4. Authentication

Only users pre-registered by the college can sign in. There's no self-signup.

### 4.1 Sign-in methods (all screens exist in the screenshots, or are listed as not-from-reference)

| Method | Phase 1 delivery | Production |
|---|---|---|
| Email + password | No provider needed | Works with no OTP provider |
| Email OTP | `console` (dev) / `gmail-smtp` (local) / `gmail-api` | `gmail-api` if configured, otherwise the method returns a generic "unavailable" |
| Mobile OTP (SMS) | `console` only | `console` refused unless `ALLOW_CONSOLE_OTP=true` (demo) |
| WhatsApp OTP | `console` only | Same as mobile |

**Consent at sign-in.** The consent checkbox is enforced **on the server too**: a login or OTP request without `consent: { accepted: true, policyVersion }` is rejected. The first successful sign-in under a new policy version writes a Consent record with a timestamp and the policy version.

### 4.2 Tokens and sessions (approved design)

```
LOGIN
 client ──POST /auth/login {email,password,consent}──▶ server
        ◀─ 200 { accessToken (15 min), user }  + Set-Cookie: sb_rt=<opaque>; HttpOnly; Secure;
                                                 SameSite=Lax; Path=/api/v1/auth; Max-Age=<refresh TTL>
 Session doc: { userId, institutionId, familyId, currentHash, previousHashes[], expiresAt, revokedAt, ua }

EVERY API CALL
 Authorization: Bearer <accessToken>  (memory only, never in storage)

APP START / RELOAD / 401 "token_expired"
 client ──POST /auth/refresh (cookie)──▶ server
   hash(cookie) == currentHash      → rotate: new refresh (cookie), new access token; old hash → previousHashes
   hash(cookie) ∈ previousHashes    → REUSE DETECTED → revoke the whole session family, clear cookie,
                                       audit-log, 401 → client goes to the Welcome screen
   unknown / expired / revoked      → 401

LOGOUT / "Clear stored data"
 client ──POST /auth/logout──▶ revoke session, clear cookie
 "Clear stored data" also clears localStorage, IndexedDB and Cache Storage, and unregisters the service worker
```

- **Access JWT:** HS256, `JWT_ACCESS_SECRET`. Claims: `sub`, `inst`, `roles`, `sid`, `iat`, `exp`. 15 minutes.
- **Refresh token:** 256-bit random. Stored only as a SHA-256 hash. Rotated on every use.
- **CSRF:** `/auth/refresh` and `/auth/logout` require the `Origin` header to match the app origin, and a custom header (`X-SB-Client: 1`). All other APIs use the Bearer header, never cookies, so they aren't CSRF-able.
- **Password change or reset** revokes all of that user's sessions.

### 4.3 OTP

- 4 digits, HMAC-SHA256 hashed at rest (server pepper).
- 5-minute expiry, enforced by a TTL index.
- At most 5 attempts per code. Resend cooldown 30 s.
- Rate limited per identifier and per IP. The counters live in Mongo with TTL indexes, so they survive a Render restart.
- Responses are always generic ("If this account exists, we sent a code"), so nobody can tell which accounts exist.

### 4.4 Forgot password and change password

- **Forgot password:** email OTP → short-lived reset grant → new password → all sessions revoked. Mobile users without email can't reset in Phase 1; their admin resets the password through the API.
- **Change password:** current password + new password.
- Both screens are not-from-reference.

### 4.5 Login identity

The sign-in screens have **no institution picker**. So email and phone must identify **one** user across the platform: they're unique **globally**, and the user's `institutionId` comes from their record (open question Q2).

## 5. Roles and permissions (RBAC)

**Roles** (full list in the schema; Phase 1 implements the first three, plus `super_admin` for platform setup): `student`, `warden`, `institution_admin`, `mess_staff` (Phase 4), `super_admin` (Space Basic staff).

**Mechanism.**

- Routes declare **permissions**, never role names.
- `shared/roles.ts` maps role → permissions, so a later phase can add a role without touching route code.
- The check runs in server middleware. The client uses the same map only to hide UI, never for security.

### Phase 1 matrix

`own` = the user's own data only. `inst` = the user's institution only. ✓ = allowed. – = denied.

| Permission | student | warden | institution_admin | super_admin |
|---|---|---|---|---|
| `auth:*` sign in / refresh / logout / change password | ✓ | ✓ | ✓ | ✓ |
| `profile:read` / `profile:update` (photo) | own | own | own | own |
| `consent:read` / `consent:withdraw` | own | own | own | own |
| `notifications:read` / `notifications:mark_read` | own | own | own | own |
| `attendance:qr:issue` (Entry Pass QR) | own | – | – | – |
| `attendance:scan` (mark attendance) | – | inst | inst | – |
| `attendance:read` | own | inst | inst | – |
| `support:read` (contacts, FAQ) | inst | inst | inst | – |
| `support:manage` | – | – | inst | – |
| `users:read` | – | inst (students in their hostel) | inst | all |
| `users:create` / `users:import` / `users:update` | – | – | inst | all |
| `users:assign_role` | – | – | inst (cannot grant `super_admin`) | all |
| `hostel:read` | own room | inst | inst | all |
| `hostel:manage` (hostels, floors, rooms) | – | – | inst | all |
| `institution:read` (name, logo, modules) | inst | inst | inst | all |
| `institution:manage` (logo, enabled modules) | – | – | inst | all |
| `institution:create` | – | – | – | ✓ |
| `audit:read` | – | – | inst | all |

**Audit log** records role changes, user create/import, consent withdrawal, session-reuse revocations, password resets, attendance scans, and module enable/disable. Each entry has the actor, target, institution, timestamp and request id.

**A withdrawn consent** blocks app use for that user (sign-out plus a message) until they consent again. The DPDPA flow is detailed at the schema step.

## 6. Multi-tenancy (institution isolation)

**Model.** One database, shared collections. Every tenant-owned document has a required, indexed `institutionId`. Every compound index starts with `institutionId`.

**Global (non-tenant) collections:**
- `institutions`
- `users` identity fields (email and phone are globally unique, but the user document still carries its `institutionId`)
- `otp_codes` and `rate_counters`

**Enforcement, in three layers, failing closed:**

1. **Context.** `authenticate` sets `req.ctx.institutionId` from the verified token, never from the request body or query.
2. **Mongoose `tenantScope` plugin** on every tenant model. Pre-hooks on `find*`, `count*`, `update*`, `delete*`, `aggregate` and `save` **throw** if the query has no `institutionId`, or if a saved document's `institutionId` differs from the scope. Services get models through `scoped(ctx)`, which injects `{ institutionId }` automatically.
3. **`super_admin` cross-tenant access** happens only through an explicit `unscoped(reason)` call, which writes an audit entry. That call is grep-able and reviewed.

**Tests.** Every module ships a cross-tenant test that seeds two institutions. A user, warden or admin of A gets **404** (not 403, so nothing leaks) for B's notifications, attendance, users, rooms and contacts. The plugin itself is unit-tested to throw on an unscoped query.

**Per-institution data:** name and logo (Presidency University logo uploaded as the institution's asset), enabled modules, support contacts, FAQ, and hostel layout (one block "West": floors CF/CS/CT, rooms 101–200 / 201–300 / 301–400, 3 beds each; data-driven).

## 7. Module system: how Phase 2+ slot in

One registry in `shared/modules.ts`:

```ts
{ key: 'leave', title: 'Leave Manager', status: 'coming_soon' | 'live', phase: 2,
  icon: 'calendar-dots', permissions: ['leave:apply', 'leave:approve', ...] }
```

**Visibility rule.** A module appears on Home (Apps grid, Quick Actions, Profile rows) when **both** are true:
- it's enabled for the user's institution (`institution.enabledModules`)
- the user's role has a permission that uses it

If its status is `coming_soon`, the entry point opens the shared **ComingSoon** screen. In Phase 1 that applies to Leave Manager, Tickets, Announcements, Mess Manager, My Information, Accessibility and Check connection. The entry points stay exactly as in the screenshots.

**Server.** Each `modules/<key>/index.ts` exports `{ key, router, permissions }`. `app.ts` mounts every module at `/api/v1/<key>` behind `requireModule(key)`. A disabled or `coming_soon` module returns 404.

**Client.** Each `features/<key>/index.ts` exports `{ routes, appTile?, quickAction?, profileRow? }`. The router and Home compose from the registry.

**Adding a module later (e.g. Leave in Phase 2), with no change to existing modules or core:**
1. `shared/schemas/leave.ts` and `shared/api/leave.ts`
2. A `server/modules/leave/` folder: model (tenant-scoped), service, routes, tests including the cross-tenant test
3. A `client/features/leave/` folder, built against its own screenshots and visual tests
4. Add permissions to `shared/roles.ts`. Approvals map to `warden` / `institution_admin`, with multi-step approval statuses.
5. Flip the registry status to `live` and enable it per institution.
6. Notifications are generic: a new `type` value plus a deep-link handler entry in `features/notifications`. "Leave Request Submitted / Partially Approved / Approved" plug in this way; in Phase 1 they exist only as seeded dev data.

**API versioning.** Changes inside `/api/v1` are additive only: new endpoints, new optional fields. Anything breaking goes to `/api/v2`, mounted alongside.

**Phase order after Phase 1:** Leave → Tickets → Announcements → Mess (adds `mess_staff`) → the rest.

## 8. Frontend architecture

- **Routing:** route guards for authenticated, role and module checks. Unauthenticated users see Welcome / Sign in only.
- **Server state:** fetched through the module's `api.ts` (typed with `@spacebasic/shared`), cached in memory only. On logout the cache is cleared, and nothing authenticated is persisted.
- **Theme:**
  - `tokens.css` has a light and a dark set: `:root[data-theme="light|dark"]`, plus `prefers-color-scheme` when Appearance = System.
  - Auth screens are always light.
  - The choice is saved per device in localStorage, as are haptics and sounds.
- **Pixel rules:** every visual value comes from tokens measured in `docs/ui-measurements.md`. Icons come only from Phosphor (per-icon imports) and the 17 cut-out SVGs, through one `<Icon>` component.
- **Errors:**
  - A root `ErrorBoundary` plus per-route boundaries.
  - API errors map to plain messages built from existing tokens and components. Error and offline states aren't in the screenshots, so they're listed in `docs/not-from-reference.md`.
- **Device info (Settings):**
  - App version, bundle id and build time are injected at build.
  - OS, OS version and model come from UA Client-Hints where available, otherwise "Unknown".
  - The device ID is random per install, stored locally.
- **QR (Entry Pass):**
  - The client requests a fresh signed token every 10 s and renders it with a QR library.
  - The countdown ring is driven by the token's `exp`.
  - The token is never cached or persisted, and the QR is cleared when the sheet closes and on logout.

## 9. QR attendance flow

```
student Entry Pass                        server                                warden scanner
 GET /attendance/qr-token  ─────────▶  sign { sub, inst, jti, iat, exp = iat+15 s }   (QR_TOKEN_SECRET, HS256)
 ◀── { token, expiresAt }               (no personal data in the token)
 render QR; refresh every 10 s
                                                                 camera → decode → POST /attendance/scan { token }
                                        verify signature + exp (≤15 s, small clock skew)
                                        token.inst == warden's institution (else 404)
                                        jti unused? insert into used_qr_tokens (unique jti, TTL 2 min)
                                          duplicate → 409 "already scanned" (replay blocked)
                                        create AttendanceLog { inst, student, scannedBy, at, kind }
                                        createNotification(student, 'attendance_marked')
                                        audit entry
                                        ◀──────────────────────────────────── 201 { student name, room } for the warden UI
```

## 10. Testing and quality gates

| Layer | Tooling | What |
|---|---|---|
| Server unit and integration | Jest + Supertest (prompt), test MongoDB (Q4) | Every module: happy path, validation errors, RBAC denials, **cross-tenant 404s**, token/OTP edge cases |
| Shared schemas | Jest | Schema accept/reject tables |
| Client logic | A test runner for the client (Q5) | apiClient refresh/retry, date formats, registry visibility |
| Visual | Playwright in the official Linux Docker image, `--font-render-hinting=none` | Per screen against the cropped screenshot (status and nav bars removed). Private real-data fixtures run locally only; fake fixtures run with masks |
| Security (step 9) | Tests + checklist | helmet headers, rate limits, sanitize, CORS, RBAC matrix tests generated from `roles.ts`, OWASP-style checklist |

## 11. Dependencies

Nothing is installed until you approve. Each one is confirmed again at the module that first needs it.

| Where | Package | Licence | Why |
|---|---|---|---|
| server | `express` | MIT | Required stack |
| server | `mongoose` | MIT | Required stack |
| server | `zod` | MIT | Approved |
| server | `jsonwebtoken` | MIT | Access and QR JWTs |
| server | `bcrypt` | MIT | Password hashing, as the prompt specifies (native build, which Render supports) |
| server | `helmet`, `express-rate-limit`, `cors`, `cookie-parser` | MIT | Security requirements. NoSQL sanitising is a small in-house middleware, because `express-mongo-sanitize` is unmaintained and breaks on Express 5 |
| server | `nodemailer` | MIT-0 | `gmail-smtp` provider, **local development only**. `gmail-api` uses plain `fetch` (OAuth2 refresh → Gmail REST), so no `googleapis` dependency |
| server (dev) | `jest`, `ts-jest`, `supertest`, `tsx` | MIT | Tests (prompt) and a TypeScript dev runner |
| server (dev) | `mongodb-memory-server` | MIT | In-memory MongoDB for tests (Q4) |
| client | `react`, `react-dom`, `react-router` | MIT | Required stack plus routing |
| client | `@fontsource-variable/plus-jakarta-sans` | OFL-1.1 | Approved |
| client | `@phosphor-icons/react` | MIT | Approved |
| client | `qrcode` | MIT | QR rendering (approved in principle) |
| client | `qr-scanner` (nimiq) | MIT | Warden camera scanning. Uses the native BarcodeDetector where available, with a WebAssembly/worker fallback |
| client (dev) | `vite`, `@vitejs/plugin-react`, `typescript` | MIT | Required stack |
| client (dev) | `vitest` | MIT | Client logic tests (Q5) |
| later | `vite-plugin-pwa` | MIT | Asked again at the PWA step |
| later | Web Push | – | Asked again before adding |

**Not proposed:** a server-state library (React Query and similar). A small typed fetch layer is enough for Phase 1. Revisit if Phase 2 needs caching or invalidation.

## 12. Decisions taken at this step (approved 2026-11-07)

| # | Decision |
|---|---|
| Q1 | One npm workspace: `client/`, `server/`, `shared/` |
| Q2 | Email and phone are unique across all institutions. Phone is normalised to E.164 (Indian 10-digit input becomes `+91…`) |
| Q3 | Refresh token lasts 30 days, extended on each use, with a hard limit of 90 days |
| Q4 | Test database: `mongodb-memory-server` |
| Q5 | Client unit tests use `vitest`; server tests use Jest + Supertest |
| Q6 | The §11 dependency list is approved. Licences are listed in `docs/decisions.md` |

Decisions taken in go mode, with defaults chosen and recorded in `docs/decisions.md`:

- **TypeScript pinned to 6.0.x.** ts-jest doesn't support TypeScript 7 yet.
- **Local development with no MongoDB URI.** The server starts `mongodb-memory-server` with a persistent data folder (`server/.data/`, gitignored) and seeds fake data on first start. No account or secret is needed. Setting `MONGODB_URI` uses a real database instead.
- **Avatars and institution logos** are stored in MongoDB, in small binary collections. That needs no paid storage.
- **One command, `npm run dev`,** starts both server and client through a small Node script. That needs no extra dependency.
