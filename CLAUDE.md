# CLAUDE.md

Space Basic is a college hostel management PWA. **Student screens** must be a **pixel-identical replica** of the screenshots in `reference-ui/`. That rule overrides every design preference. Warden and admin screens are free design (see "Decisions already made").

## Status

- **Current phase (2026-11-09, end of session):** Phase 1, step 6 (frontend), go mode with runnable checkpoints (`SPEC.md`, "Go mode and checkpoints"; the gated list below is superseded). The user does all git (see "Open items" → Git); check `git status` for what is uncommitted.
- **Done:**
  - **Backend, all Phase 1 modules:** Auth, Users/Profile, Consent, Hostel/Floor/Room, Notifications, QR/Attendance, Support/FAQ, the institution logo endpoints, the password rule (not the account's email or phone; create, import, change, reset), the compact 96-character HMAC QR token (approved, a test per property), relaxed dev/test sign-in limits (`RELAX_RATE_LIMITS`, `npm run dev:relaxed`; refused in production). **175 Jest tests.**
  - **Student screens (strict pixel-perfect), visual % from `npm run test:visual` (Docker, real DPR 3):**

    | Screen | Route | Visual |
    |---|---|---|
    | Welcome | `/` | 0.93% |
    | Sign in, Mobile / Email | `/sign-in/mobile`, `/sign-in/email` | 1.28% / 1.59% |
    | One-time codes (SMS, WhatsApp, email) and Forgot password | `/sign-in/code`, `/forgot-password`, `/forgot-password/code` | no screenshot |
    | Home + tab bar | `/home` | 1.32% |
    | Notifications | `/notifications` | 0.90% |
    | Help, plus Contact us and Common questions | `/support`, `/support/contact`, `/support/faqs` | 0.98% (sub-screens: no screenshot) |
    | My Profile, top / scrolled | `/profile` | 1.14% / 1.11% |
    | Entry Pass (QR sheet over My Profile) | `/profile/entry-pass` | 0.70% (QR data modules masked: they change with every token) |
    | Settings, dark (top) / light (scrolled to the end) | `/settings` | 0.93% / 1.04% |
    | Change Password, Privacy & Consent | `/profile/password`, `/profile/privacy` | no screenshot (plain) |

    Screens and states without a screenshot are listed in `docs/not-from-reference.md`. My Profile's My Information and About rows, and Settings' Accessibility and Check connection rows, open ComingSoon.
  - **Role routing and plain staff homes:** one app per role (`client/src/auth/areas.ts`): students `/home`, wardens `/warden`, admins `/admin`; cross-role URLs redirect to the user's own app; staff have no tab bar. Two roles: "Continue as" (`/choose`), remembered per user on the device; switch from the staff account menu or the "Switch role" row (multi-role accounts only) in My Profile. Server role separation: `server/src/test/role-separation.test.ts`. Staff section pages are "Coming soon".
  - **Reload sign-out fix (approved):** for 10 s after a rotation the immediately previous refresh token works once more; the client refreshes one tab at a time (Web Locks). `/auth/logout` accepts an older token of the session.
  - **Tests:** server 175/175; client unit tests 40/40; `smoke-settings.ts` and `smoke-roles.ts` pass after the last changes. **Not re-run since the last changes: `smoke-signin.ts` and `smoke-otp.ts`.** The smoke scripts start the dev stack themselves with relaxed sign-in limits (`tools/ui-analysis/src/dev-stack.ts`), or `smoke-signin` / `smoke-roles` / `smoke-settings` reuse a running one (start it with `npm run dev:relaxed`); `smoke-otp` needs the ports free.
  - Git history was rewritten earlier (approved) to remove the screenshot owner's name and device ID; the scan of every ref was clean.
- **Next, in this order (user plan 2026-11-09):**
  1. **(a) Admin users screens** (free design, desktop-friendly, admins only, functional tests): users list and search, add and edit, accept a user and assign a room (room picker showing free beds, enforced server-side), disable, CSV import. No student self-signup in this phase. Then **CHECKPOINT**.
  2. **(b) Deployment** on Vercel (client), Render (server) and MongoDB Atlas. In the repo: `vercel.json` with the `/api` rewrite, Render build and start commands, health check, the production env var list in `.env.example` and the README; verify both builds from a clean clone. Then walk the user through creating the Atlas cluster and setting the environment variables, one step at a time; never ask for a secret. Then **CHECKPOINT**.
  - **Postponed until after deployment:** the warden scanner and other warden screens (`qr-scanner`, MIT, approved, not installed yet), and the rest of the admin screens (hostel structure, support content, audit log).
- **Open items (waiting on the user):**
  - The original **Presidency logo** file: the supplied one is wider than the app's mark (logo tile region ~15%).
- **Session notes:**
  - Visual tests need Docker Desktop; starting it is fine. `npm run test:visual` builds with the screenshot's sample build stamp (`scripts/visual-build.mjs`).
  - Light colours not measured on a screenshot (light Home tokens, the camera-badge ring on a light card, parts of the light Notifications, Help, My Profile and Entry Pass) remain provisional; the light card, tile, chevron and danger colours are now measured on `settings-light.png`.
  - Seeded dev notifications get read by smoke runs: `npm run seed -w server -- --reset` restores the dev data (run it while `npm run dev` is up).
  - Before a smoke run, make sure ports 5173 / 4000 / 27027 are free, or reuse the running stack; on Windows stop the stack with `taskkill /PID <root> /T /F`.
  - Two-role dev user (student + warden): `devika.menon@example.com` / `Both@2026`.
  - Every decision is in `docs/decisions.md` (latest rows, 2026-11-09: the refresh grace fix, the new plan, Settings values and visual stamping, the shared header, measured light tokens, haptics/sounds, Clear stored data, Change Password and Privacy & Consent).
- **Workflow:** gated. Stop for the user's approval after each of these:
  1. Analysis
  2. Architecture
  3. Mongoose schemas
  4. REST API plan
  5. Backend, one module at a time, with Jest + Supertest results
  6. Frontend, one module at a time, with visual tests
  7. Integration
  8. PWA
  9. Security
  10. Deploy
- **Never build more than one step at a time.**
- **Phase 1 scope:** the supplied (student) screens plus the minimum supporting flows, then the free-design staff screens (see "Decisions already made"). Unsupplied modules (Leave, Tickets, Announcements, Mess, My Information, Accessibility, Check connection) open a shared `ComingSoon` screen. Any screen built without a reference is listed in `docs/not-from-reference.md`.

## Stack (fixed)

| Area | Choice |
|---|---|
| Client | React + Vite, **TypeScript strict** |
| Server | Node + Express, **TypeScript strict** |
| Database | MongoDB Atlas + Mongoose |
| Auth | JWT + bcrypt |
| Deploy | Vercel (client) and Render (server) |
| API | REST under `/api/v1`, one folder per module |
| Validation | **zod** for body, query and params, through one reusable middleware |
| Shared code | One place for shared schemas and API types, used by both client and server. No `any` without a stated reason |

## Rules that are easy to break

- **Dependencies:** ask before adding any. Name it, its licence and the reason. Never suggest paid services or paid upgrades.
- **Lookalikes:** never substitute one. If an asset doesn't match the screenshot, stop, show a side-by-side, and wait.
- **Measurements:** take them with scripts, don't eyeball. Record them in `docs/ui-measurements.md` and `client/src/styles/tokens.css`. Both a light and a dark token set are needed.
- **Visual numbers:** report them **only** from Playwright's Linux Docker image, with `--font-render-hinting=none` and a REAL device scale factor (`npm run test:visual`; Playwright's emulated `deviceScaleFactor` snaps to CSS px, unlike a phone). See README, "Visual tests". Target under 1%. Up to about 3% is acceptable when the only remaining differences are text or edge rendering. Show the reference, the render and the diff.
- **Personal data:** the screenshots contain a real name, phone and email. Never commit them.
  - `reference-ui/*.png` and `client/tests/fixtures/private/` are gitignored.
  - Commit fake equivalents with the same character counts.
- **Secrets:** only in `.env`, which is gitignored. Commit `.env.example` with placeholders. Never ask the user to paste secrets.
- **Access control:** enforce roles in backend middleware. Scope every query by `institutionId`.
- **Existing code:** don't delete or overwrite it without explaining why first.

## Decisions already made (don't re-ask)

- **Font:** Plus Jakarta Sans, self-hosted from `@fontsource-variable/plus-jakarta-sans`, Latin subset. The type scale is in `docs/ui-measurements.md` §2.
- **Logos:** use the supplied files as-is, never recoloured and never stretched (`object-fit: contain`, centred in the screenshot's measured ink box). SpaceBasic pill region 4.46% (accepted); Presidency logo tile ~15% until the original file arrives.
- **Default avatar (v2, approved):** `reference-ui/assets/avatar-default.png`, a 198 px RGBA file on the screenshot's pixel grid.
  - Render it at exactly 66 CSS px, on whole CSS pixels.
  - Don't add `border-radius`; the file already has a smooth circular alpha.
  - A user's uploaded photo replaces it.
- **Camera badge (approved):** a separate component placed over the avatar.
  - 22 px blue disc (#4A5CE6), 2 px ring in `var(--surface-card)`, `right/bottom: -4px`.
  - Glyph: `reference-ui/assets/icons/cutout/camera.svg` (vectorised cut-out, `fill="currentColor"`, white via CSS `color`), in a 14 px box.
  - The light-card ring colour is **provisional** until the user sends a light Profile screenshot.
- **Sessions:**
  - 15-minute access JWT kept in memory only.
  - Rotating refresh token in an httpOnly, Secure, SameSite=Lax cookie, with reuse detection that revokes the whole session. For 10 s after a rotation the immediately previous token works once more (approved 2026-11-09); the client refreshes one tab at a time (Web Locks).
  - Vercel rewrites `/api/*` to Render so the cookie is first-party.
  - Render's free tier can take up to about a minute to wake up: show a normal loading state and retry once.
- **OTP providers:** behind one `OtpDelivery` interface, chosen with `OTP_PROVIDER`.
  - `console`: refused in production unless `ALLOW_CONSOLE_OTP=true`.
  - `gmail-api`: production email.
  - `gmail-smtp`: local development only.
  - Mobile and WhatsApp OTP use `console` for now.
  - Email + password login must work in production without any OTP provider.
- **Roles:** `student`, `warden` and `institution_admin` in Phase 1. The full role list goes in the schema.
- **Staff screens are free design** (user decision, 2026-11-08). The pixel-identical rule applies to **student screens only**. Warden and `institution_admin` screens have no reference screenshots and are designed freely:
  - Reuse the existing tokens, Plus Jakarta Sans, the Phosphor icons and cut-outs, and the shared components, in light and dark.
  - Admin screens work well at desktop widths as well as on phones. Warden screens are phone-first.
  - Each role lands on its own home after sign-in. Staff never get student screens and students never get staff screens. The server's role rules stay as they are.
  - Functional tests only: no visual diff tests for staff screens. Every staff screen is listed in `docs/not-from-reference.md` as "free design".
  - **Warden scope:** QR scanner, today's attendance list, student and room lookup.
  - **Admin scope:** summary home; users (search, add, edit, roles, CSV import); hostel structure with rooms and beds; support contacts and FAQs; audit log view.
  - **Order (user plan, 2026-11-09, later message):** Settings + Change Password + Privacy & Consent (done), then the admin users screens, then deployment, a checkpoint after each. The warden screens and the other admin screens (hostel, support content, audit log) come after deployment.
  - **Role routing:** one app per role (students `/home`, wardens `/warden`, admins `/admin`), two-role accounts choose ("Continue as") and switch; details in `docs/decisions.md` 2026-11-09.
  - This replaces the earlier "no admin screens in Phase 1" decision. The seed and CSV import scripts stay.
- **Rooms:** one block, "West".

  | Floor | Code | Rooms |
  |---|---|---|
  | First | CF | CF101–CF200 |
  | Second | CS | CS201–CS300 |
  | Third | CT | CT301–CT400 |

  Each room has 3 beds. Keep this data-driven.
- **Settings device rows:** show "Unknown" when a value isn't available. The device ID is random per install and stored locally.
- **Canvas:** the screenshots are 1080 px wide, so DPR is 3. The auth screens are 360×780 CSS px; in-app screens are 360×800.

## Open items

- **Icon set: Phosphor** (`@phosphor-icons/react` 2.1.10, MIT) is the single set. It matches 26 of the screenshot icon crops.
  - Import each icon from its own path, for example `@phosphor-icons/react/dist/csr/HouseSimple`.
  - Weights and sizes are in `docs/ui-measurements.md` §4.
  - The 16 icons no library matches, plus the camera glyph, are **approved vectorised cut-outs**:
    - Files: `reference-ui/assets/icons/cutout/*.svg`, with `fill="currentColor"`.
    - Made with `potrace` (GPL-2.0). It is **tools-only**: it must never appear in `client/` or `server/` package.json, and nothing there may import it.
    - Thresholds are pinned in `FIXED_T` in `trace-icons.ts`.
    - The final check is each screen's Docker visual regression.
  - **Git (user rule, 2026-11-08): the user does ALL git** (staging, commits, push). Claude never runs `git add`, `git commit` or `git push` and never asks about them. Read-only git (`status`, `log`, `diff`, `show`) is fine. Every checkpoint ends with a short **"Git for you"** section: (1) a one-line suggested commit message (two if the work splits into code and docs), (2) the changed and new files, (3) a reminder to run the private-data search on the staged changes (never `.env*`, `.data`, `screenshot-text.json`, `client/tests/fixtures/private/` or `reference-ui/*.png`). Nothing else about git.
- **The user's original rule for icons:**
  - Compare **Lucide, Phosphor and Heroicons** with `src/icons-multi.ts`, installed in the analysis folder only.
  - **Never use Tabler.** It was tested and doesn't match.
  - Filled active tabs are tested two ways: an outline icon filled via CSS, and each library's solid or fill variant.
  - If one set matches, use **only that set** for the whole app, importing each icon from its own path. Never mix sets.
  - Icons that still don't match are cut out of the screenshots and **vectorised to SVG**, never raster, and coloured from theme tokens.
  - The vectorising tool needs the user's approval first, with its name and licence.
  - Every cut-out icon is listed in `docs/ui-measurements.md` §4.

## Tooling

- `tools/ui-analysis/` holds dev-only measurement and diff scripts. Run them in Docker with:
  `node tools/ui-analysis/run-in-docker.mjs src/<script>.ts`
- Outputs go to `tools/ui-analysis/out/linux/`, which is gitignored.
- Key scripts:

  | Script | What it does |
  |---|---|
  | `fontfit.ts` | Type-scale fit |
  | `wordmark.ts` | Welcome logo pill |
  | `icons-multi.ts` | Icon comparison across libraries |
  | `badge.ts` | Avatar and camera badge |
  | `logo-transparent.ts` | Transparent logo |
  | `avatar-v2.ts` | Default avatar |

  `avatar-v2.ts` and `logo-transparent.ts` **write asset files**, so only rerun them on purpose.
- `tools/ui-analysis/scratch/` holds one-off debug probes. It is **gitignored**; don't commit it. Every committed script is listed in `docs/ui-measurements.md` §8.
- The analysis-only packages (Playwright, pixelmatch, pngjs, the comparison fonts and the icon libraries) are not app dependencies.
- Visual tests need Docker Desktop; starting it (`Docker Desktop.exe`) when it isn't running is fine (user, 2026-11-08).
- The shell is Windows, so Git Bash and PowerShell are both available. With `docker -v` in Git Bash, set `MSYS_NO_PATHCONV=1`.
