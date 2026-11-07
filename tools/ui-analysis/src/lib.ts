// Shared helpers for reference-screenshot analysis (dev tooling only).
// Runs with Node 24 native type stripping: `node src/<script>.ts`.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { chromium, type Browser, type Page } from 'playwright';

export const ROOT = path.resolve(import.meta.dirname, '../../..');
export const REF = path.join(ROOT, 'reference-ui');
export const OUT = process.env.UI_OUT ?? path.resolve(import.meta.dirname, '../out');
export const DPR = 3;
fs.mkdirSync(OUT, { recursive: true });

export type RGB = [number, number, number];
export interface Rect { x: number; y: number; w: number; h: number }

export function loadPng(file: string): PNG {
  return PNG.sync.read(fs.readFileSync(path.isAbsolute(file) ? file : path.join(REF, file)));
}
export function savePng(png: PNG, file: string): string {
  const p = path.isAbsolute(file) ? file : path.join(OUT, file);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, PNG.sync.write(png));
  return p;
}
export function blank(w: number, h: number, c: RGB = [255, 255, 255], a = 255): PNG {
  const png = new PNG({ width: w, height: h });
  for (let i = 0; i < w * h; i++) {
    png.data[i * 4] = c[0]; png.data[i * 4 + 1] = c[1]; png.data[i * 4 + 2] = c[2]; png.data[i * 4 + 3] = a;
  }
  return png;
}
export function crop(src: PNG, r: Rect): PNG {
  const out = new PNG({ width: r.w, height: r.h });
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const sx = r.x + x, sy = r.y + y;
      const o = (y * r.w + x) * 4;
      if (sx < 0 || sy < 0 || sx >= src.width || sy >= src.height) { out.data[o + 3] = 0; continue; }
      const i = (sy * src.width + sx) * 4;
      out.data[o] = src.data[i]; out.data[o + 1] = src.data[i + 1]; out.data[o + 2] = src.data[i + 2]; out.data[o + 3] = src.data[i + 3];
    }
  }
  return out;
}
export function px(png: PNG, x: number, y: number): RGB {
  const i = (y * png.width + x) * 4;
  return [png.data[i], png.data[i + 1], png.data[i + 2]];
}
export const hex = (c: RGB) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase();
export const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Most frequent colour in the image (the background). */
export function modeColor(png: PNG): RGB {
  const m = new Map<number, number>();
  for (let i = 0; i < png.width * png.height; i++) {
    const k = (png.data[i * 4] << 16) | (png.data[i * 4 + 1] << 8) | png.data[i * 4 + 2];
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  let best = 0, bk = 0;
  for (const [k, v] of m) if (v > best) { best = v; bk = k; }
  return [(bk >> 16) & 255, (bk >> 8) & 255, bk & 255];
}
/** Ink colour = the pixel farthest from the background (fully covered glyph/stroke pixel). */
export function inkColor(png: PNG, bg: RGB): RGB {
  // use the median of the top 2% farthest pixels to avoid stray outliers
  const ds: { d: number; c: RGB }[] = [];
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const c = px(png, x, y); const d = dist(c, bg); if (d > 30) ds.push({ d, c });
  }
  ds.sort((a, b) => b.d - a.d);
  const top = ds.slice(0, Math.max(1, Math.floor(ds.length * 0.02)));
  return top[Math.floor(top.length / 2)].c;
}
export function inkBBox(png: PNG, bg: RGB, thresh = 40): Rect | null {
  let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    if (dist(px(png, x, y), bg) > thresh) { if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y; }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}
/** Horizontal bands of rows that contain ink inside a region. */
export function rowBands(png: PNG, r: Rect, bg: RGB, thresh = 40): [number, number][] {
  const bands: [number, number][] = []; let start = -1;
  for (let y = r.y; y < r.y + r.h; y++) {
    let ink = false;
    for (let x = r.x; x < r.x + r.w; x++) if (dist(px(png, x, y), bg) > thresh) { ink = true; break; }
    if (ink && start < 0) start = y;
    if (!ink && start >= 0) { bands.push([start, y - 1]); start = -1; }
  }
  if (start >= 0) bands.push([start, r.y + r.h - 1]);
  return bands;
}

/** Place `src` onto a canvas of w x h filled with bg at offset (ox, oy). */
export function place(src: PNG, w: number, h: number, ox: number, oy: number, bg: RGB): PNG {
  const out = blank(w, h, bg);
  for (let y = 0; y < src.height; y++) for (let x = 0; x < src.width; x++) {
    const tx = x + ox, ty = y + oy; if (tx < 0 || ty < 0 || tx >= w || ty >= h) continue;
    const i = (y * src.width + x) * 4, o = (ty * w + tx) * 4;
    const a = src.data[i + 3] / 255;
    for (let k = 0; k < 3; k++) out.data[o + k] = Math.round(src.data[i + k] * a + bg[k] * (1 - a));
  }
  return out;
}

export interface DiffResult { mismatch: number; ink: number; total: number; pctInk: number; pctArea: number; diff: PNG; ref: PNG; cand: PNG; dx: number; dy: number }
/**
 * Align the candidate to the reference by ink bounding box (plus a +/-range px search),
 * then pixelmatch with anti-aliasing detection on (AA pixels are not counted).
 * pctInk = mismatched / union-of-ink pixels (strict, discriminative)
 * pctArea = mismatched / crop area (comparable to whole-screen mismatch %)
 */
export function alignedDiff(ref: PNG, cand: PNG, bg: RGB, opts: { pad?: number; range?: number; mask?: Rect[] } = {}): DiffResult {
  const pad = opts.pad ?? 6, range = opts.range ?? 2;
  const rb = inkBBox(ref, bg)!, cb = inkBBox(cand, bg) ?? { x: 0, y: 0, w: 1, h: 1 };
  const W = Math.max(rb.w, cb.w) + pad * 2 + range * 2, H = Math.max(rb.h, cb.h) + pad * 2 + range * 2;
  const R = place(ref, W, H, pad + range - rb.x, pad + range - rb.y, bg);
  applyMask(R, opts.mask?.map((m) => ({ ...m, x: m.x + pad + range - rb.x, y: m.y + pad + range - rb.y })), bg);
  let best: DiffResult | null = null;
  for (let dy = -range; dy <= range; dy++) for (let dx = -range; dx <= range; dx++) {
    const C = place(cand, W, H, pad + range - cb.x + dx, pad + range - cb.y + dy, bg);
    applyMask(C, opts.mask?.map((m) => ({ ...m, x: m.x + pad + range - rb.x, y: m.y + pad + range - rb.y })), bg);
    const diff = new PNG({ width: W, height: H });
    const mismatch = pixelmatch(R.data, C.data, diff.data, W, H, { threshold: 0.1, includeAA: false, alpha: 0.2 });
    if (!best || mismatch < best.mismatch) {
      let ink = 0;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (dist(px(R, x, y), bg) > 40 || dist(px(C, x, y), bg) > 40) ink++;
      best = { mismatch, ink, total: W * H, pctInk: (100 * mismatch) / Math.max(1, ink), pctArea: (100 * mismatch) / (W * H), diff, ref: R, cand: C, dx, dy };
    }
  }
  return best!;
}
function applyMask(png: PNG, mask: Rect[] | undefined, bg: RGB) {
  if (!mask) return;
  for (const m of mask) for (let y = m.y; y < m.y + m.h; y++) for (let x = m.x; x < m.x + m.w; x++) {
    if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
    const o = (y * png.width + x) * 4; png.data[o] = bg[0]; png.data[o + 1] = bg[1]; png.data[o + 2] = bg[2]; png.data[o + 3] = 255;
  }
}

// ---------- browser ----------
let browser: Browser | null = null;
export async function newPage(w = 360, h = 800): Promise<Page> {
  browser ??= await chromium.launch({ args: (process.env.CHROMIUM_ARGS ?? '').split(' ').filter(Boolean) });
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: DPR });
  return ctx.newPage();
}
export async function closeBrowser() { await browser?.close(); browser = null; }

export const fontFaceCss = (family: string, file: string, range = '200 900') =>
  `@font-face{font-family:'${family}';src:url('data:font/woff2;base64,${fs.readFileSync(file).toString('base64')}') format('woff2');font-weight:${range};font-style:normal;font-display:block}`;

export const FONTS: Record<string, { file: string; range: string }> = {
  'Plus Jakarta Sans': { file: 'node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2', range: '200 800' },
  Manrope: { file: 'node_modules/@fontsource-variable/manrope/files/manrope-latin-wght-normal.woff2', range: '200 800' },
  Figtree: { file: 'node_modules/@fontsource-variable/figtree/files/figtree-latin-wght-normal.woff2', range: '300 900' },
  'DM Sans': { file: 'node_modules/@fontsource-variable/dm-sans/files/dm-sans-latin-wght-normal.woff2', range: '100 1000' },
};
export const allFontCss = () =>
  Object.entries(FONTS).map(([f, v]) => fontFaceCss(f, path.resolve(import.meta.dirname, '..', v.file), v.range)).join('\n');

/** Screenshot an element as PNG. */
export async function shotEl(page: Page, selector: string): Promise<PNG> {
  return PNG.sync.read(await page.locator(selector).screenshot({ animations: 'disabled', omitBackground: false }));
}
export const dataUrl = (png: PNG) => 'data:image/png;base64,' + PNG.sync.write(png).toString('base64');

/** Build a labelled comparison sheet (HTML rendered at DPR 1) and save it. */
export async function sheet(file: string, title: string, rows: { label: string; note?: string; imgs: { cap: string; png: PNG }[] }[], scale = 1): Promise<string> {
  browser ??= await chromium.launch({ args: (process.env.CHROMIUM_ARGS ?? '').split(' ').filter(Boolean) });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  const html = `<html><body style="margin:0;padding:24px;background:#fff;font:14px system-ui;color:#111">
  <h2 style="margin:0 0 16px">${title}</h2>
  ${rows.map((r) => `<div style="display:flex;gap:20px;align-items:flex-start;border-top:1px solid #ddd;padding:12px 0">
    <div style="width:220px;flex:none"><b>${r.label}</b><div style="color:#555;margin-top:4px;white-space:pre-line">${r.note ?? ''}</div></div>
    ${r.imgs.map((i) => `<figure style="margin:0"><img src="${dataUrl(i.png)}" style="width:${i.png.width * scale}px;image-rendering:pixelated;outline:1px solid #ccc;display:block"><figcaption style="color:#555;font-size:12px;margin-top:4px">${i.cap}</figcaption></figure>`).join('')}
  </div>`).join('')}</body></html>`;
  await page.setContent(html);
  const p = path.join(OUT, file);
  await page.screenshot({ path: p, fullPage: true });
  await ctx.close();
  return p;
}
