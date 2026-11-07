# CLAUDE.md

Space Basic is a college hostel management PWA. The UI must be a **pixel-identical replica** of the screenshots in `reference-ui/`. That rule overrides every design preference.

## Status

- **Current phase (2026-11-08):** Phase 1, step 5 (backend modules). Steps 2–4 are written in `docs/architecture.md`, `docs/schemas.md` and `docs/api.md` (go mode, see `docs/decisions.md`). Modules built and tested: **Auth**, **Users/Profile**, **Consent** (waiting at its checkpoint). Next module: Hostel/Floor/Room. No `client/` code yet. The workflow below is superseded by go mode with runnable checkpoints (`docs.md`, "Go mode and checkpoints").
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
- **Phase 1 scope:** only the supplied screens plus the minimum supporting flows. Unsupplied modules (Leave, Tickets, Announcements, Mess, My Information, Accessibility, Check connection) open a shared `ComingSoon` screen. Any screen built without a reference is listed in `docs/not-from-reference.md`.

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
- **Visual numbers:** report them **only** from Playwright's Linux Docker image, with `--font-render-hinting=none` (see README, "Visual tests"). Target under 1%. Up to about 3% is acceptable when the only remaining differences are text or edge rendering. Show the reference, the render and the diff.
- **Personal data:** the screenshots contain a real name, phone and email. Never commit them.
  - `reference-ui/*.png` and `client/tests/fixtures/private/` are gitignored.
  - Commit fake equivalents with the same character counts.
- **Secrets:** only in `.env`, which is gitignored. Commit `.env.example` with placeholders. Never ask the user to paste secrets.
- **Access control:** enforce roles in backend middleware. Scope every query by `institutionId`.
- **Existing code:** don't delete or overwrite it without explaining why first.

## Decisions already made (don't re-ask)

- **Font:** Plus Jakarta Sans, self-hosted from `@fontsource-variable/plus-jakarta-sans`, Latin subset. The type scale is in `docs/ui-measurements.md` §2.
- **Logo:** use the supplied `reference-ui/assets/logo-spacebasic-transparent.png` as-is, never recoloured. The ~4% mismatch on the logo pill is accepted.
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
  - Rotating refresh token in an httpOnly, Secure, SameSite=Lax cookie, with reuse detection that revokes the whole session.
  - Vercel rewrites `/api/*` to Render so the cookie is first-party.
  - Render's free tier can take up to about a minute to wake up: show a normal loading state and retry once.
- **OTP providers:** behind one `OtpDelivery` interface, chosen with `OTP_PROVIDER`.
  - `console`: refused in production unless `ALLOW_CONSOLE_OTP=true`.
  - `gmail-api`: production email.
  - `gmail-smtp`: local development only.
  - Mobile and WhatsApp OTP use `console` for now.
  - Email + password login must work in production without any OTP provider.
- **Roles:** `student`, `warden` and `institution_admin` in Phase 1. The full role list goes in the schema.
- **No admin screens in Phase 1:** admins use seed/CSV import scripts and the API. The warden scanner is one plain camera screen.
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
  - **Git:** the history so far is 4 commits, in the order the user asked for: `.gitignore`, tooling, assets, docs. Commit only what the user asks for, in their order.
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
- The shell is Windows, so Git Bash and PowerShell are both available. With `docker -v` in Git Bash, set `MSYS_NO_PATHCONV=1`.
