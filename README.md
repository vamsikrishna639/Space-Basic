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
| `CLIENT_IP_HEADER` | `x-vercel-forwarded-for`: the visitor's address, from a header Vercel overwrites itself (measured; Vercel passes a visitor's own `X-Forwarded-For` through and sends no `x-real-ip` to Render) | `render.yaml`; check after any hosting change (below) |
| `TRUST_PROXY` | `3`: the fallback when that header is missing, the address that connected to Render's edge (can't be faked) | `render.yaml` |
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
5. **Check:** `https://<project>.vercel.app/api/v1/health` (through the rewrite), and `https://<project>.vercel.app/api/v1/health/client`: its `ip` must be **your own public address** and `ipFrom` `x-vercel-forwarded-for`. Then the spoofing test: `curl.exe -s -H "X-Forwarded-For: 203.0.113.7" -H "X-Real-IP: 203.0.113.8" -H "X-Vercel-Forwarded-For: 203.0.113.9" https://<project>.vercel.app/api/v1/health/client` must still show your own address as `ip`. (Rate limits count per address: a proxy's address makes all users share one limit, and a made-up one lets a caller dodge the limits.) The `headers` field shows what each candidate header carried; `docs/decisions.md` 2026-11-09 says what to change if the test fails.

The free Render service sleeps after 15 minutes without requests; the next request wakes it in up to about a minute, and the app shows its loading state meanwhile (Vercel waits up to 120 s for a proxied request).

### First admin (production has no seed data)

From your own computer, in this repository, with the Atlas connection string held only by this terminal:

```
# PowerShell
$s = Read-Host "Atlas connection string" -AsSecureString   # paste it; hidden, not saved in the history
$env:MONGODB_URI = (New-Object System.Net.NetworkCredential("", $s)).Password; Remove-Variable s
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


### Android app (Trusted Web Activity)

The web app is installable (manifest, icons, a service worker that stores nothing) and the Android app is a Trusted Web Activity: a thin APK that opens https://spacebasic-presidency.vercel.app full screen in Chrome. It is built with PWABuilder (pwabuilder.com, free; its Android packaging is Google's Bubblewrap, Apache-2.0), so the APK needs no app code in this repo.

- **Package ID:** `app.vercel.spacebasic_presidency.twa`, the same as in `client/public/.well-known/assetlinks.json`. The two must match.
- **Digital Asset Links:** replace `REPLACE_WITH_SHA256_FINGERPRINT` in `assetlinks.json` with the signing key's SHA-256 fingerprint (`AA:BB:...`, 32 pairs) and push. Check it at `https://spacebasic-presidency.vercel.app/.well-known/assetlinks.json`. Until it matches, the app opens with a browser address bar. If the app goes to Google Play with Play App Signing, add Play's app-signing fingerprint as a second entry in the list.
- **The signing key never goes in git** (`.gitignore` excludes `*.keystore`, `*.jks`, `*.p12`, `signing-key-info.txt`). Losing it means no updates to the installed app under the same package.
- **Camera (warden scanner):** nothing to set in the APK. The camera belongs to Chrome: the first scan asks "Allow while visiting the site", then Android asks to let Chrome use the camera. If a warden refused it, allow it again in Chrome › Settings › Site settings › Camera, and Android Settings › Apps › Chrome › Permissions › Camera. The site must be https (it is) and `vercel.json` keeps `Permissions-Policy: camera=(self)`.
- **System bars:** the status bar follows the page's `theme-color`, set per screen and theme by `client/src/theme/statusBar.ts` from `tokens.css`, so colour changes there need no new APK. The navigation bar can only come from the APK: `navigationColor` / `navigationColorDark` in `android/twa-manifest.json` (docs/ui-measurements.md §16).

**Building a new APK** (since 1.0.1 it is built from `android/twa-manifest.json`, not on pwabuilder.com). Needs Node, a JDK (21 works) and the Android SDK build tools (Android Studio installs them). Bubblewrap is installed in its own folder, outside the repo:

1. Raise `appVersionCode` (and `appVersion`) in `android/twa-manifest.json`; every update needs a higher code.
2. `npm install --prefix <tools folder> @bubblewrap/core@1.27.0`, then `BUBBLEWRAP_DIR=<tools folder> node android/generate.mjs <empty folder>`.
3. In that folder: `local.properties` with `sdk.dir=C:/Users/<you>/AppData/Local/Android/Sdk`, then `gradlew assembleRelease` (behind an HTTPS-scanning antivirus, set `JAVA_TOOL_OPTIONS=-Djavax.net.ssl.trustStoreType=Windows-ROOT` so Java uses the Windows certificate store).
4. `zipalign -p -f 4 app/build/outputs/apk/release/app-release-unsigned.apk <aligned.apk>` (SDK build-tools).
5. Sign with the existing key: `powershell -ExecutionPolicy Bypass -File android\sign-apk.ps1 -Keystore <signing.keystore> -Unsigned <aligned.apk>`. It asks for the passwords (hidden), and replaces `client/public/downloads/Space-Basic.apk` only if the certificate matches `assetlinks.json`.
6. On the phone, open the new APK and tap **Update**: same package and key with a higher version code installs over the old app and keeps sign-ins. Don't uninstall first.

## Seasonal Home

A temporary festive look for the student Home screen only, switched in `client/src/config/seasonal.ts`:

```ts
export const SEASONAL_HOME: SeasonalHome | null = 'diwali'; // null = the normal Home, exactly as before
export const SEASONAL_HOME_ENDS: string = '';                // 'YYYY-MM-DD': last day shown (phone's date); '' = no end
```

Changing either needs a deploy; an end date that has passed switches the look off by itself. Nothing else (other screens, manifest, icons, service worker) depends on it.

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
- The seasonal Home (`home-diwali`) and the normal Home (`home`) are both tested from the same build: the visual-test build ignores `SEASONAL_HOME` and each spec picks the season through `localStorage['sb.visual.seasonalHome']` (see "Seasonal Home" below).
- In-app screens mock the API in the browser from a fixture. When a screenshot shows personal data, the exact data lives in the gitignored `client/tests/fixtures/private/<name>.json`; without it the committed fake fixture is used (same character counts) and those regions are masked.

### Sign-in smoke test

`node tools/ui-analysis/src/smoke-signin.ts` signs in through the UI as the seeded fake users (consent gate, wrong password, Home data, reload, ComingSoon, Notifications list and mark-as-read, Help contacts and FAQs, My Profile data and photo upload, the Entry Pass with a warden scan of the shown code, Sign Out). `node tools/ui-analysis/src/smoke-settings.ts` checks Settings, Change Password and Privacy & Consent. `node tools/ui-analysis/src/smoke-roles.ts` checks role routing (each role's own app, blocked cross-role URLs, the two-role chooser and switcher). `node tools/ui-analysis/src/smoke-admin-users.ts` checks the admin Users screens (list, Accept with the room picker, add, edit, disable, CSV import); the users it creates are disabled and moved out at the end, so it can run repeatedly. They reuse a running dev stack, or start one themselves with relaxed sign-in limits (`tools/ui-analysis/src/dev-stack.ts`); for repeated runs against your own stack, start it with `npm run dev:relaxed` (`RELAX_RATE_LIMITS=true`, development only). They use the host's Playwright Chromium and check behaviour only.

`node tools/ui-analysis/src/smoke-otp.ts` checks the one-time-code sign-in (SMS, WhatsApp, email) and Forgot password the same way. It starts the dev stack itself with relaxed limits, because the codes only print in the server console, so stop any running dev server first. It can run back to back: a run started within 30 s of the last one waits out the (unchanged) resend cooldown first. The reset puts the student's seeded password back.

### Private data

The reference screenshots and `client/tests/fixtures/private/` contain real personal data. Both are gitignored.

- The runner **bind-mounts** the working copy into the container. Nothing is copied into an image, and no image is built or pushed.
- Without the private files, tests run against the committed fake fixtures instead. Those tests mask the regions that show personal data.
