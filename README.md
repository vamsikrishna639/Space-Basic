# Space Basic

Space Basic is a college hostel management PWA: React + Vite client (`client/`), Express + MongoDB API (`server/`), shared zod schemas and types (`shared/`), one npm workspace. Specification: `SPEC.md`; decisions: `docs/decisions.md`; API: `docs/api.md`.

## Run it locally

Node 24 (`engines` in `package.json`). No accounts or `.env` needed:

```
npm ci
npm run dev            # client http://localhost:5173, API http://localhost:4000/api/v1
```

The first start creates a local MongoDB in `server/.data/` (gitignored) and seeds FAKE data; the sign-ins are printed in the console. `npm run dev:relaxed` raises the sign-in limits for repeated smoke runs. Tests: `npm test` (server Jest + client Vitest), `npm run typecheck`, `npm run test:visual` (Docker, below).

## Deployment (Vercel + Render + MongoDB Atlas, all free plans)

```
browser ── https://<project>.vercel.app ──┬── static client (client/dist)
                                           └── /api/*  ── rewrite ──> https://spacebasic-api.onrender.com/api/*  ──> MongoDB Atlas
```

The browser only ever talks to the Vercel address, so the refresh cookie is first-party. The repository holds all the configuration:

| File | What it sets |
|---|---|
| `vercel.json` | install `MONGOMS_DISABLE_POSTINSTALL=1 npm ci --include=dev`, build `npm run build:web`, output `client/dist`, the `/api/*` rewrite to Render, the SPA fallback, cache and security headers |
| `render.yaml` | a Blueprint: Node web service `spacebasic-api`, free plan, Singapore; build `npm ci --include=dev && npm run build:api`, start `npm run start:api`, health check `/api/v1/health`, the environment below |
| `server/.env.example` | every server variable, with the production values |
| `package.json` | `build:web`, `build:api`, `start:api`; Node `24.x` (both hosts read it) |

### Production environment (Render)

The client needs no variables. The API refuses to start if any of these is missing or wrong, and says which.

| Variable | Value | Who sets it |
|---|---|---|
| `NODE_ENV` | `production` | `render.yaml` |
| `PORT` | given by Render | Render |
| `MONGODB_URI` | `mongodb+srv://<user>:<password>@<cluster>.mongodb.net/spacebasic?retryWrites=true&w=majority` | you, in the Render dashboard (from Atlas) |
| `JWT_ACCESS_SECRET`, `QR_TOKEN_SECRET`, `OTP_PEPPER` | 256-bit random | Render generates them (`generateValue`); nobody sees or copies them |
| `APP_ORIGINS` | `https://<project>.vercel.app` (https, no trailing slash; several separated by commas) | you, in the Render dashboard |
| `COOKIE_SECURE` | `true` | `render.yaml` |
| `TRUST_PROXY` | `4` (the forwarded hops measured on the first deploy: Vercel's rewrite and Render's edge and load balancer) | `render.yaml`; recheck after any hosting change (below) |
| `OTP_PROVIDER` | not set: email + password sign-in only, one-time codes off | (later: `gmail-api` and the four `GMAIL_API_*` variables) |
| `ALLOW_CONSOLE_OTP`, `RELAX_RATE_LIMITS`, `GMAIL_USER`, `GMAIL_APP_PASSWORD` | never in production | |

To make a secret yourself (for example to rotate one), run this and paste the output straight into the Render dashboard, nowhere else:

```
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
```

Changing `JWT_ACCESS_SECRET` signs everyone out; changing `OTP_PEPPER` voids codes in flight; changing `QR_TOKEN_SECRET` voids Entry Pass codes for at most 15 s.

### Steps (first deployment)

1. **GitHub:** push the repository (private) to GitHub. Render and Vercel build from it.
2. **MongoDB Atlas** (cloud.mongodb.com): a free **M0** cluster on **AWS, Singapore (ap-southeast-1)**, next to the Render region.
   - Database Access: a user with **Specific Privileges → `readWrite` on database `spacebasic`** only; "Autogenerate Secure Password".
   - Network Access: `0.0.0.0/0`. Render's free plan has no fixed outgoing addresses; the long generated password is the protection.
   - Connect → Drivers: copy the `mongodb+srv://…` string, put the password in, and add the database name: `…mongodb.net/spacebasic?retryWrites=true&w=majority…`.
3. **Render** (render.com): New → **Blueprint** → the repository. Render reads `render.yaml` and asks for `MONGODB_URI` and `APP_ORIGINS` (`https://<project>.vercel.app`, the name you'll give the Vercel project). The first deploy takes a few minutes; then `https://spacebasic-api.onrender.com/api/v1/health` answers `{"status":"ok"}`. If Render gave the service another address, change the rewrite's `destination` in `vercel.json` to it and push.
4. **Vercel** (vercel.com): Add New → Project → the repository. Leave Root Directory as the repository root and Framework Preset as "Other": `vercel.json` sets the rest. No environment variables. Deploy. If the address isn't the one in `APP_ORIGINS`, change `APP_ORIGINS` on Render to it (Render redeploys).
5. **Check:** `https://<project>.vercel.app/api/v1/health` (through the rewrite), and `https://<project>.vercel.app/api/v1/health/client`: its `ip` must be **your own public address**. If it isn't, set `TRUST_PROXY` on Render to the `suggestedTrustProxy` it shows. (Rate limits count per address: a wrong value makes all users share one limit.)

The free Render service sleeps after 15 minutes without requests; the next request wakes it in up to about a minute, and the app shows its loading state meanwhile (Vercel waits up to 120 s for a proxied request).

### First admin (production has no seed data)

From your own computer, in this repository, with the Atlas connection string held only by this terminal:

```
# PowerShell
$env:MONGODB_URI = Read-Host "Atlas connection string"      # paste it here; it isn't saved in the history
npm run create-admin -w server -- --logo ../reference-ui/assets/logo-presidency.png
Remove-Item Env:MONGODB_URI
```

```
# bash
read -rs -p "Atlas connection string: " MONGODB_URI && export MONGODB_URI && echo
npm run create-admin -w server -- --logo ../reference-ui/assets/logo-presidency.png
unset MONGODB_URI
```

It asks for the institution's name and time zone, then the admin's name, email, optional mobile number and password (typed hidden, twice), and creates the institution and that admin, nothing else. Options: `--logo <file>` (PNG/JPEG/WebP ≤ 1 MB, path relative to `server/`), and `--layout` to also create block West with the placeholder floors (CF101–CF200, CS201–CS300, CT301–CT400, 3 beds a room; `docs/decisions.md` 2026-11-07). Run it again with another email for a second admin; the institution is reused. Then sign in on `https://<project>.vercel.app`.

### Users in production

- **In the app (simplest):** Admin → Users → Import CSV (or Add user).
- **With the script**, against the deployed app; it asks for the admin email and password (hidden):

  ```
  npm run import-users -w server -- path/to/users.csv --accept-privacy-policy --api https://<project>.vercel.app/api/v1
  ```

- **Passwords:** with one-time codes off (no `OTP_PROVIDER`), a user can only sign in with a password, and "Forgot password" can't send a code. Give every user a first password (the `password` column, or the Add user form) until email codes are set up with `gmail-api`. A CSV with passwords is sensitive: delete it after the import.

### Rehearse a deployment locally

`node tools/ui-analysis/src/verify-deploy.ts` copies exactly what git would commit into two empty folders, runs Render's and Vercel's commands from `render.yaml` and `vercel.json`, starts the API in production mode against a throwaway database, creates an admin with `create-admin`, checks sign-in, cookie flags, the Origin check and production rate limits, then serves the client with `vercel.json`'s rules and signs in through Chromium. Ports 4100 and 4180 must be free.

### Updating

Push to `main`: Render and Vercel both build and deploy it. The API's indexes are created at startup. Watch Render's log for the startup line and `GET /api/v1/health`.


## Visual tests (Docker)

Visual comparisons run **only** inside Playwright's official Linux image. Its Chromium renders text the same way as Android Chrome, where the reference screenshots were captured, and every run gets the same browser, fonts and settings. Mismatch numbers from Windows or macOS are not comparable and are not reported.

### One-time setup

1. Install and start **Docker Desktop**.
2. Install the analysis tooling:
   ```bash
   cd tools/ui-analysis && npm ci
   ```
3. The image is pinned to the installed Playwright version, for example `mcr.microsoft.com/playwright:v1.65.0-noble`. Docker downloads it on first use.

### Running

Run these from the repository root:

```bash
node tools/ui-analysis/run-in-docker.mjs src/fontfit.ts          # font fit (set FONT_ONLY="Plus Jakarta Sans" to test one font)
node tools/ui-analysis/run-in-docker.mjs src/wordmark.ts         # welcome logo pill
LIB=lucide node tools/ui-analysis/run-in-docker.mjs src/icons.ts # icon comparison (LIB=lucide or LIB=tabler)
node tools/ui-analysis/run-in-docker.mjs src/badge.ts            # avatar and camera badge
```

On Windows PowerShell, set environment variables like this first: `$env:LIB='lucide'`.

The runner starts Chromium with `--font-render-hinting=none`, because Android doesn't hint glyphs. Measured on the same text samples, this lowers the mean text mismatch from 24.8% to 8.6%. Don't change it, or numbers stop being comparable across runs.

Results go to `tools/ui-analysis/out/linux/`: comparison sheets (reference, render and diff side by side) plus JSON.

### Per-screen visual regression

```bash
npm run test:visual                  # build client/dist, then diff every screen in Docker
npm run test:visual -- welcome       # one or more screen ids, comma-separated
```

- Screens are listed in `client/tests/visual/screens.ts` (route, reference file, the app band to compare, named regions).
- The runner (`tools/ui-analysis/src/visual.ts`) serves `client/dist` inside the container, renders at 360 CSS px with a real device scale factor of 3 (`--force-device-scale-factor=3`; Playwright's emulated DPR snaps to CSS px, unlike a phone), crops both images to the app band (no status or navigation bar), and runs pixelmatch.
- Output (gitignored) in `client/tests/visual/__output__/`: `<id>-sheet.png` (reference, render and diff side by side), `<id>-render.png`, `<id>-diff.png` and `results.json`. The console also prints each named element's offset from the reference in CSS px.
- Pass is under 1%; the ceiling is 3% when only text or edge rendering differs. The command fails above 3%.
- In-app screens mock the API in the browser from a fixture. When a screenshot shows personal data, the exact data lives in the gitignored `client/tests/fixtures/private/<name>.json`; without it the committed fake fixture is used (same character counts) and those regions are masked.

### Sign-in smoke test

`node tools/ui-analysis/src/smoke-signin.ts` signs in through the UI as the seeded fake users (consent gate, wrong password, Home data, reload, ComingSoon, Notifications list and mark-as-read, Help contacts and FAQs, My Profile data and photo upload, the Entry Pass with a warden scan of the shown code, Sign Out). `node tools/ui-analysis/src/smoke-settings.ts` checks Settings, Change Password and Privacy & Consent. `node tools/ui-analysis/src/smoke-roles.ts` checks role routing (each role's own app, blocked cross-role URLs, the two-role chooser and switcher). `node tools/ui-analysis/src/smoke-admin-users.ts` checks the admin Users screens (list, Accept with the room picker, add, edit, disable, CSV import); the users it creates are disabled and moved out at the end, so it can run repeatedly. They reuse a running dev stack, or start one themselves with relaxed sign-in limits (`tools/ui-analysis/src/dev-stack.ts`); for repeated runs against your own stack, start it with `npm run dev:relaxed` (`RELAX_RATE_LIMITS=true`, development only). They use the host's Playwright Chromium and check behaviour only.

`node tools/ui-analysis/src/smoke-otp.ts` checks the one-time-code sign-in (SMS, WhatsApp, email) and Forgot password the same way. It starts the dev stack itself with relaxed limits, because the codes only print in the server console, so stop any running dev server first. It can run back to back: a run started within 30 s of the last one waits out the (unchanged) resend cooldown first. The reset puts the student's seeded password back.

### Private data

The reference screenshots and `client/tests/fixtures/private/` contain real personal data. Both are gitignored.

- The runner **bind-mounts** the working copy into the container. Nothing is copied into an image, and no image is built or pushed.
- Without the private files, tests run against the committed fake fixtures instead. Those tests mask the regions that show personal data.
