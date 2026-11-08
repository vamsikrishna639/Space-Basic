// Per-screen visual regression (SPEC.md, "Pixel-perfect UI constraint" 7). Runs ONLY in Playwright's Linux image:
//   npm run test:visual [-- <id,id>]      (root script: builds client/dist on the host, then runs this in Docker)
//
// Serves client/dist from inside the container (no dev server, no API), renders each screen in client/tests/visual/
// screens.ts at 360 CSS px wide with a real device scale factor of 3, crops both images to the app band (no OS status / navigation bar),
// and pixel-diffs them. Report: whole-band mismatch % (pixelmatch, threshold 0.1, anti-aliased pixels ignored) and,
// per named region, the ink box of render vs reference in CSS px (used to tune positions).
// Outputs (gitignored): client/tests/visual/__output__/<id>-sheet.png (reference | render | diff), <id>-render.png,
// <id>-diff.png, results.json. Exit code 1 if any screen is above the 3% ceiling.
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium, type Browser, type Page } from 'playwright';
import { ROOT, loadPng, crop, inkBBox, px, sheet, closeBrowser, DPR, type RGB } from './lib.ts';
import { SCREENS, type ScreenSpec } from '../../../client/tests/visual/screens.ts';

const DIST = path.join(ROOT, 'client/dist');
const OUTDIR = path.join(ROOT, 'client/tests/visual/__output__');
const PRIVATE = path.join(ROOT, 'client/tests/fixtures/private');
const TARGET = 1, CEILING = 3;
fs.mkdirSync(OUTDIR, { recursive: true });
if (!fs.existsSync(path.join(DIST, 'index.html'))) { console.error('client/dist missing: run `npm run build -w client` first'); process.exit(2); }

// ---- static server for the built client (SPA fallback to index.html) ----
const TYPES: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url ?? '/').split('?')[0]!);
  let file = path.join(DIST, url);
  if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] ?? 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;

// A REAL device scale factor, not Playwright's emulated one: with emulation Chromium lays out and snaps text, borders
// and backgrounds on whole CSS px and scales the result, while a DPR-3 phone snaps them to device px
// (scratch/dsf-test.ts). So each screen height gets its own browser with --force-device-scale-factor=3 and a window
// of exactly that size, and no viewport emulation.
const browsers = new Map<number, Browser>();
async function browserFor(heightCss: number): Promise<Browser> {
  let b = browsers.get(heightCss);
  if (!b) {
    b = await chromium.launch({ args: [...(process.env.CHROMIUM_ARGS ?? '').split(' ').filter(Boolean), `--force-device-scale-factor=${DPR}`, `--window-size=360,${heightCss}`] });
    browsers.set(heightCss, b);
  }
  return b;
}
const only = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const css = (v: number) => (v / DPR).toFixed(2);
const results: Record<string, unknown> = {};
let worst = 0;

for (const spec of SCREENS.filter((s) => !only || only.has(s.id))) {
  const [top, bottom] = spec.app;
  const bandH = bottom - top;
  const screenMode = spec.viewport === 'screen';
  // 'band': the viewport is the band, whose height need not be whole CSS px (739.333); 'screen': full height.
  const appHeightCss = screenMode ? spec.screenHeight! : bandH / DPR;
  const ctx = await (await browserFor(Math.ceil(appHeightCss))).newContext({
    viewport: null,
    colorScheme: spec.colorScheme ?? 'light',
    ...(spec.timezone ? { timezoneId: spec.timezone } : {}),
  });
  const page = await ctx.newPage();
  if (spec.time) await page.clock.setFixedTime(new Date(spec.time));
  const fixture = spec.fixture ? loadFixture(spec.fixture) : null;
  if (fixture) await mockApi(page, fixture.data);
  await page.goto(base + spec.route, { waitUntil: 'networkidle' });
  const vars: Record<string, string> = { '--app-height': `${appHeightCss.toFixed(4)}px`, ...spec.cssVars };
  await page.addStyleTag({ content: `:root { ${Object.entries(vars).map(([k, v]) => `${k}: ${v};`).join(' ')} }` });
  for (const sx of spec.scrollX ?? []) await page.locator(sx.selector).evaluate((el, left) => { el.scrollLeft = left; }, sx.left);
  await page.evaluate(() => document.fonts.ready);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(200);
  const shot = PNG.sync.read(await page.screenshot({ animations: 'disabled', caret: 'hide' }));
  await ctx.close();
  if (shot.width !== 1080) throw new Error(`expected a 1080 px wide screenshot (real DPR 3), got ${shot.width}`);

  const render = crop(shot, { x: 0, y: screenMode ? top : 0, w: 1080, h: bandH });
  const ref = crop(loadPng(spec.ref), { x: 0, y: top, w: 1080, h: bandH });
  const masks = [...(spec.masks ?? []), ...(fixture && !fixture.private ? spec.fakeMasks ?? [] : [])];
  for (const m of masks) { paint(ref, m.rect); paint(render, m.rect); }
  if (fixture) console.log(`  (${fixture.private ? 'private fixture: exact screenshot data' : 'fake fixture: personal-data regions masked'})`);

  const diff = new PNG({ width: 1080, height: bandH });
  const mismatch = pixelmatch(ref.data, render.data, diff.data, 1080, bandH, { threshold: 0.1, includeAA: false, alpha: 0.25 });
  const pct = (100 * mismatch) / (1080 * bandH);
  worst = Math.max(worst, pct);

  const regions = spec.regions.map((r) => regionReport(ref, render, r.name, r.rect));
  for (const r of spec.regions.filter((x) => x.zoom)) {
    const [x, y, w, h] = r.rect; const rr = regions.find((q) => q.name === r.name)!;
    const slug = r.name.replace(/\W+/g, '-');
    const p = await sheet(`${spec.id}-${slug}-zoom.png`, `${spec.id} · ${r.name}: reference | render | diff (${rr.pct}% of the region)`, [
      { label: r.name, note: `${rr.pct}% mismatch
(device px, 1:1)`, imgs: [{ cap: 'reference', png: crop(ref, { x, y, w, h }) }, { cap: 'render', png: crop(render, { x, y, w, h }) }, { cap: 'diff', png: crop(diff, { x, y, w, h }) }] },
    ], 1);
    fs.renameSync(p, path.join(OUTDIR, `${spec.id}-${slug}-zoom.png`));
  }
  results[spec.id] = { mismatchPct: +pct.toFixed(3), regions };
  fs.writeFileSync(path.join(OUTDIR, `${spec.id}-render.png`), PNG.sync.write(render));
  fs.writeFileSync(path.join(OUTDIR, `${spec.id}-diff.png`), PNG.sync.write(diff));
  const verdict = pct < TARGET ? 'PASS (<1%)' : pct <= CEILING ? 'WITHIN CEILING (1-3%)' : 'FAIL (>3%)';
  console.log(`\n${spec.id}: ${pct.toFixed(2)}% mismatch  ${verdict}`);
  for (const r of regions) console.log(`  ${r.name.padEnd(24)} ${r.text}`);
  const sheetPath = await sheet(`${spec.id}-sheet.png`, `${spec.id}: reference | render | diff (${pct.toFixed(2)}% mismatch)`, [
    { label: spec.id, note: `${spec.route}\n${pct.toFixed(2)}% mismatch\n${verdict}`, imgs: [{ cap: 'reference (app band)', png: ref }, { cap: 'render', png: render }, { cap: 'diff (red = mismatch)', png: diff }] },
  ], 1 / DPR);
  fs.renameSync(sheetPath, path.join(OUTDIR, `${spec.id}-sheet.png`));
}

fs.writeFileSync(path.join(OUTDIR, 'results.json'), JSON.stringify(results, null, 2));
for (const b of browsers.values()) await b.close();
await closeBrowser(); server.close();
process.exit(worst > CEILING ? 1 : 0);

// ---- API fixtures ----------------------------------------------------------------------------------------
// A fixture is { me, unreadCount?, logoFile? }. The private copy (gitignored) has the screenshot's exact data.
interface Fixture { me: Record<string, unknown> & { institution: { logoUrl: string | null } }; unreadCount?: number; logoFile?: string }
function loadFixture(name: string): { data: Fixture; private: boolean } {
  const priv = path.join(PRIVATE, `${name}.json`);
  const file = fs.existsSync(priv) ? priv : path.join(ROOT, 'client/tests/fixtures', `${name}.json`);
  return { data: JSON.parse(fs.readFileSync(file, 'utf8')) as Fixture, private: file === priv };
}

async function mockApi(page: Page, f: Fixture) {
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const key = `${req.method()} ${url.pathname.replace(/^\/api\/v1/, '')}`;
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (key === 'POST /auth/refresh') return json({ accessToken: 'visual-test', expiresIn: 900, user: f.me });
    if (key === 'GET /users/me') return json(f.me);
    if (key === 'GET /notifications/unread-count') return json({ count: f.unreadCount ?? 0 });
    if (f.logoFile && f.me.institution.logoUrl && url.pathname === new URL(f.me.institution.logoUrl, base).pathname) {
      return route.fulfill({ status: 200, contentType: 'image/png', body: fs.readFileSync(path.join(ROOT, f.logoFile)) });
    }
    return json({ error: { code: 'NOT_FOUND', message: 'Not found.' } }, 404);
  });
}

function paint(png: PNG, [x, y, w, h]: [number, number, number, number]) {
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) {
    const o = (j * png.width + i) * 4; png.data[o] = 255; png.data[o + 1] = 0; png.data[o + 2] = 255; png.data[o + 3] = 255;
  }
}

function regionReport(ref: PNG, render: PNG, name: string, [x, y, w, h]: [number, number, number, number]) {
  const a = crop(ref, { x, y, w, h }), b = crop(render, { x, y, w, h });
  const pct = +((100 * pixelmatch(a.data, b.data, null, w, h, { threshold: 0.1, includeAA: false })) / (w * h)).toFixed(2);
  const bg: RGB = px(a, 0, 0);
  const ra = inkBBox(a, bg), rb = inkBBox(b, bg);
  if (!ra || !rb) return { name, pct, text: `ink missing in ${ra ? 'render' : 'reference'}` };
  const d = { dx: rb.x - ra.x, dy: rb.y - ra.y, dw: rb.w - ra.w, dh: rb.h - ra.h };
  const ok = Object.values(d).every((v) => Math.abs(v) <= 1);
  return {
    name, pct, ...d,
    text: `${ok ? 'ok ' : '>> '} dx ${css(d.dx).padStart(6)}  dy ${css(d.dy).padStart(6)}  dw ${css(d.dw).padStart(6)}  dh ${css(d.dh).padStart(6)}   (ref ink ${css(ra.w)}×${css(ra.h)} at ${css(x + ra.x)},${css(y + ra.y)})  region ${pct}%`,
  };
}

export type { ScreenSpec };
