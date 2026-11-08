# Space Basic

Space Basic is a college hostel management PWA. The `client/` and `server/` folders arrive in Phase 1.

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

With `npm run dev` running, `node tools/ui-analysis/src/smoke-signin.ts` signs in through the UI as the seeded fake users (consent gate, wrong password, Home data, reload, ComingSoon, sign-out). It uses the host's Playwright Chromium and checks behaviour only.

`node tools/ui-analysis/src/smoke-otp.ts` checks the one-time-code sign-in (SMS, WhatsApp, email) and Forgot password the same way. It starts `npm run dev` itself, because the codes only print in the server console, so stop any running dev server first. The API allows 5 codes an hour per address, so it can run only a few times an hour; the reset puts the student's seeded password back.

### Private data

The reference screenshots and `client/tests/fixtures/private/` contain real personal data. Both are gitignored.

- The runner **bind-mounts** the working copy into the container. Nothing is copied into an image, and no image is built or pushed.
- Without the private files, tests run against the committed fake fixtures instead. Those tests mask the regions that show personal data.
