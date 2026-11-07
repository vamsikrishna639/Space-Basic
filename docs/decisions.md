# Decisions log

**Precedence, highest first:** the user's latest chat instructions, then this file, then `CLAUDE.md`, then `SPEC.md` (the spec).

Dates are when the decision was made. **U** = decided by the user. **G** = decided in go mode under a default; the user reviews these later.

## Product and UI

| Date | By | Decision |
|---|---|---|
| 2026-11-07 | U | Font: Plus Jakarta Sans (`@fontsource-variable/plus-jakarta-sans`, Latin subset). Verified by pixel diff against Manrope, Figtree and DM Sans (`ui-measurements.md` §2) |
| 2026-11-07 | U | Wordmark "spacebasic" is text in PJS 800. The supplied app logo is used as-is (background made transparent). The logo pill's ~4% mismatch is accepted |
| 2026-11-07 | U | Icons: Phosphor is the single set, imported per icon. 16 cut-outs plus the camera glyph are traced with potrace into SVGs using `fill="currentColor"`. Never Tabler, never mix sets |
| 2026-11-07 | U | Default avatar v2 (`avatar-default.png`): 66 CSS px, no border-radius. CameraBadge is a separate component. The light-card ring colour is provisional |
| 2026-11-07 | U | Visual tests run only in Playwright's Linux Docker image with `--font-render-hinting=none`. Accept a screen at ≤ ~3% when only text or edge rendering differs |
| 2026-11-07 | U | Third Quick Action chip is "Book meal" (one constant). It opens Mess Manager ComingSoon |
| 2026-11-07 | U | Settings device rows show "Unknown" when a value isn't readable. The device ID is random per install |
| 2026-11-07 | U | Hostel layout: block "West"; floors CF 101–200, CS 201–300, CT 301–400; 3 beds per room. These are **fake placeholder values until confirmed**, and are data-driven |

## Architecture and security

| Date | By | Decision |
|---|---|---|
| 2026-11-07 | U | One npm workspace: `client/`, `server/`, `shared/` |
| 2026-11-07 | U | Email and phone are unique across all institutions. Phone is stored as E.164 |
| 2026-11-07 | U | Sessions: 15-min access JWT kept in memory. Rotating refresh token in an httpOnly cookie (SameSite=Lax), 30 days sliding, 90-day hard cap, reuse revokes the family. Vercel rewrite `/api/*` → Render |
| 2026-11-07 | U | OTP providers: `console` (refused in production unless `ALLOW_CONSOLE_OTP=true`), `gmail-api` (production email), `gmail-smtp` (local only). Mobile and WhatsApp use console only. Email + password works without any provider |
| 2026-11-07 | U | No admin screens in Phase 1: admins use seed/CSV scripts plus the API. The warden scanner is one plain camera screen |
| 2026-11-07 | U | Tests: Jest + Supertest + mongodb-memory-server (server), vitest (client) |
| 2026-11-07 | U | Go mode: steps 2–4 are written as docs without a gate, then modules are built with a runnable checkpoint after each |
| 2026-11-07 | G | **TypeScript pinned to 6.0.x** (Apache-2.0). ts-jest 29 supports `typescript <7`, and 7.0 is the new native compiler |
| 2026-11-07 | G | **Server compiles to CommonJS** (Node 20.19+). This avoids Jest's experimental ESM mode. `shared` exposes a `source` export condition: dev (tsx), Jest and Vite read its TypeScript directly, and the production server reads compiled `shared/dist` |
| 2026-11-07 | G | **Local DB:** with no `MONGODB_URI` in development, the server starts `mongodb-memory-server` with a persistent folder `server/.data/` (gitignored) and seeds fake data on first start. No account is needed. A real `MONGODB_URI` overrides this |
| 2026-11-07 | G | **`npm run dev`** at the root starts server and client through `scripts/dev.mjs` (Node child processes, prefixed output). No extra dependency |
| 2026-11-07 | G | **Avatars and logos** are stored as small binary documents in MongoDB (`assets`), ≤ 1 MB, PNG/JPEG/WebP. No paid storage. Uploads are raw request bodies, so there's no multipart library |
| 2026-11-07 | G | **OTP hashing:** HMAC-SHA256 with a server pepper. bcrypt is for passwords only; codes expire after 5 minutes and allow 5 attempts |
| 2026-11-07 | G | **NoSQL-injection sanitising** is a small in-house middleware that strips `$`- and `.`-prefixed keys. `express-mongo-sanitize` is unmaintained and incompatible with Express 5 |
| 2026-11-07 | G | **Login failures** return 401 `INVALID_CREDENTIALS` with one generic message for every cause. OTP requests always return 202 |
| 2026-11-07 | G | **Seeded notifications** (dev only) cover every Phase 1 type in the screenshot, so the list can be tested before Leave or Announcements exist |
| 2026-11-08 | G | **Jest + MongoDB driver 7.8:** the test DB helper passes `runtimeAdapters: { os }` to `mongoose.connect`. The driver otherwise loads `os` with a dynamic `import()`, which Jest's CommonJS sandbox rejects; the driver swallows the error and sends an empty handshake, so every test timed out. Tests only; plain Node is unaffected |
| 2026-11-08 | G | **Dev OTP default:** in development, when `OTP_PROVIDER` is absent entirely, codes print to the server console. An explicit empty value still means password-only. Production never gets a default |
| 2026-11-08 | G | **`npm run dev`** skips the client until `client/package.json` exists (backend-only checkpoints) |
| 2026-11-08 | G | **Assets** live in `server/src/modules/assets/` (model and service shared by avatars and, later, the institution logo). Uploads are checked by magic bytes, not just the declared Content-Type. The avatar is served `private, no-cache` with an ETag; the client fetches it with the Bearer token and shows a blob URL |
| 2026-11-08 | U | **Warden visibility:** wardens list all students of their institution. Phase 1 has one hostel and wardens aren't assigned to hostels, so "students in their hostel" becomes the same set. A per-hostel warden assignment can narrow it later without an API change |
| 2026-11-08 | U | **`super_admin` users are hidden** from institution user lists and can't be edited by institution admins. Admins can't disable themselves or change their own roles (no self-lockout) |
| 2026-11-08 | U | **Rooms in user management:** only students have a room. Bed capacity (`room.beds`) is enforced on create, import and move. Removing a user's `student` role also removes them from their room |
| 2026-11-08 | U | **`mess_staff` is not assignable** in Phase 1 (create, import or role change give 400). It becomes assignable when the Mess module is built |
| 2026-11-08 | G | **CSV import** goes through the API (`POST /users/import`) with the admin's credentials from `SB_ADMIN_EMAIL` and `SB_ADMIN_PASSWORD` (environment only). Signing in records consent, so the script needs an explicit `--accept-privacy-policy` flag. The CSV parser is in-house, so there's no new dependency |
| 2026-11-08 | G | **Consent is re-checked at token refresh**, not on every request. No active consent for the current policy version ends the session with `403 CONSENT_REQUIRED`, and the client returns to sign-in, where the consent box records it again. Withdrawal revokes every session at once. After a policy-version bump the delay is at most one 15-minute access token |
| 2026-11-08 | G | **Consent records are kept** (withdrawal sets `withdrawnAt`). A sign-in after an earlier record is stored as `reconsent`. The refresh-cookie helpers moved to `core/security/cookies.ts` so consent withdrawal can clear the cookie |
| 2026-11-08 | U | **Floor codes are unique across an institution**, not only within a hostel (checked in the service; the documented index is unchanged). Room codes (floor code + number) are unique per institution, so two hostels with a "CS" floor would make `CS240` ambiguous |
| 2026-11-08 | U | **Room beds can't drop below the room's active occupants** (`409`) |
| 2026-11-08 | U | **No rename or delete** of hostels or floors, and no change to a floor's room range, in Phase 1 |
| 2026-11-08 | G | **Room generation is idempotent** and only fills missing numbers. Hostel reads are for wardens and admins; students see only their own room through `/users/me` |
| 2026-11-08 | G | **`requireModule(key)`** (`core/middleware/module.ts`) gates registry modules, starting with Notifications. It needs the module `live` in `shared/modules.ts` and enabled for the institution; otherwise `404`. Users, Consent and Hostel are core, not registry modules, so they aren't gated |
| 2026-11-08 | G | **Notification titles and deep links** come from one map per type in `shared/schemas/notifications.ts`, matching the screenshot text. Every new dev-server start tops up seed data that newer modules add (only where missing; existing records are never changed) |
| 2026-11-08 | U | **No "mark all as read" and no Web Push** in Phase 1 (neither is in the screenshots) |
| 2026-11-08 | U | **QR libraries:** free, open-source ones are pre-approved; each is named with its licence in the dependency table below (`qrcode` and `qr-scanner`, both MIT) |

## Dependencies (all free and open source; approved 2026-11-07)

**Shipped with the app:**

| Package | Licence | Where | Purpose |
|---|---|---|---|
| express | MIT | server | HTTP framework |
| mongoose | MIT | server | MongoDB ODM |
| zod | MIT | shared, server, client | Validation and shared types |
| jsonwebtoken | MIT | server | Access and QR JWTs |
| bcrypt | MIT | server | Password hashing |
| helmet | MIT | server | Security headers |
| express-rate-limit | MIT | server | Rate limiting |
| cors | MIT | server | CORS allow-list |
| cookie-parser | MIT | server | Refresh cookie |
| nodemailer | MIT-0 (MIT without the attribution clause) | server | `gmail-smtp` OTP provider, local development only |
| react, react-dom | MIT | client | UI |
| react-router | MIT | client | Routing |
| @fontsource-variable/plus-jakarta-sans | OFL-1.1 (font licence, free) | client | Font |
| @phosphor-icons/react | MIT | client | Icon set |
| qrcode | MIT | client | Entry Pass QR rendering |
| qr-scanner | MIT | client | Warden camera scanning |

**Development only:**

| Package | Licence | Where | Purpose |
|---|---|---|---|
| typescript | Apache-2.0 | all | |
| tsx | MIT | server | Dev runner |
| jest, ts-jest | MIT | server | Tests |
| supertest | MIT | server | HTTP tests |
| mongodb-memory-server | MIT | server | Tests and the local dev database |
| @types/* | MIT | all | Type definitions |
| vite | MIT | client | Build and dev server |
| @vitejs/plugin-react | MIT | client | React plugin for Vite |
| vitest | MIT | client | Unit tests |
| vite-plugin-pwa | MIT | client | Added at the PWA step |

**Tools only (`tools/ui-analysis`, never shipped):** playwright (Apache-2.0), pixelmatch (ISC), pngjs (MIT), lucide-react (ISC), @tabler/icons-react (MIT; comparison only), @phosphor-icons/react (MIT), @heroicons/react (MIT), the @fontsource-variable comparison fonts (OFL-1.1), react and react-dom (MIT), and **potrace (GPL-2.0)**.

potrace is the one exception to the MIT/Apache/BSD/ISC list. It was explicitly approved as a dev-time tracer: it's never in `client/` or `server/`, and its output SVG paths aren't covered by the GPL.
