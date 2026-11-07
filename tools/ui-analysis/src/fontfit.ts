// Fit candidate fonts to text crops from the reference screenshots and pixel-diff them.
//  - size: from ink width (or from cap height for ALL-CAPS samples, whose width also depends on tracking)
//  - weight: interpolated so the rendered ink MASS equals the reference (robust to sub-pixel shifts)
//  - score: pixelmatch (AA detection on) after ink-box alignment + sub-pixel offset search
import fs from 'node:fs';
import path from 'node:path';
import { loadPng, crop, modeColor, inkColor, inkBBox, alignedDiff, newPage, closeBrowser, allFontCss, shotEl, sheet, hex, dist, px, OUT, DPR, FONTS, type RGB } from './lib.ts';
import type { PNG } from 'pngjs';

interface Sample { id: string; file: string; text: string; r: [number, number, number, number]; caps?: boolean; tnum?: boolean }
export const SAMPLES: Sample[] = [
  { id: 'w-headline-1', file: '01-welcome.png', text: 'Seamless campus', r: [50, 1172, 760, 98] },
  { id: 'w-headline-2', file: '01-welcome.png', text: 'living.', r: [50, 1276, 245, 100] },
  { id: 'w-sub-1', file: '01-welcome.png', text: 'Hostel, mess, fees and', r: [50, 1412, 560, 58] },
  { id: 'w-sub-2', file: '01-welcome.png', text: 'requests — in one app.', r: [50, 1488, 560, 60] },
  { id: 'w-btn-email', file: '01-welcome.png', text: 'Continue with email', r: [310, 1715, 460, 75] },
  { id: 's-title', file: 'settings-dark.png', text: 'Settings', r: [150, 168, 300, 80] },
  { id: 's-section', file: 'settings-dark.png', text: 'ABOUT THIS APP', r: [90, 352, 320, 38], caps: true },
  { id: 's-label-appver', file: 'settings-dark.png', text: 'App version', r: [90, 460, 260, 54] },
  { id: 's-value-appver', file: 'settings-dark.png', text: '11.1.1', r: [880, 460, 110, 54] },
  { id: 's-label-lastupd', file: 'settings-dark.png', text: 'Last updated', r: [90, 788, 290, 54] },
  { id: 's-value-lastupd', file: 'settings-dark.png', text: '3 Nov 2026, 1:52 PM', r: [570, 788, 420, 54] },
  { id: 's-label-os', file: 'settings-dark.png', text: 'Operating system', r: [90, 924, 380, 56] },
  { id: 's-value-os', file: 'settings-dark.png', text: 'Android', r: [800, 924, 190, 56] },
  { id: 's-value-devid', file: 'settings-dark.png', text: '<device-id>', r: [590, 1464, 400, 46] },
  { id: 's-appearance', file: 'settings-dark.png', text: 'Appearance', r: [90, 1664, 265, 54] },
  { id: 's-appearance-sub', file: 'settings-dark.png', text: "System matches your phone's light or dark setting", r: [90, 1724, 860, 50] },
  { id: 's-seg-system', file: 'settings-dark.png', text: 'System', r: [170, 1850, 175, 58] },
  { id: "w-headline-1:track", file: "01-welcome.png", text: "Seamless campus", r: [50, 1172, 760, 98], caps: true },
  { id: "w-headline-2:track", file: "01-welcome.png", text: "living.", r: [50, 1276, 245, 100], caps: true },
  { id: "s-value-devid:tnum", file: "settings-dark.png", text: "<device-id>", r: [590, 1464, 400, 46], tnum: true },
  { id: "s-value-devid:track", file: "settings-dark.png", text: "<device-id>", r: [590, 1464, 400, 46], caps: true },
  { id: "s-value-devid:tnum+track", file: "settings-dark.png", text: "<device-id>", r: [590, 1464, 400, 46], caps: true, tnum: true },
  { id: "s-value-appver:tnum", file: "settings-dark.png", text: "11.1.1", r: [880, 460, 110, 54], tnum: true },
  { id: "s-value-bundle", file: "settings-dark.png", text: "11.1.1-20261103-082255-", r: [465, 596, 525, 46] },
  { id: "s-value-bundle:tnum", file: "settings-dark.png", text: "11.1.1-20261103-082255-", r: [465, 596, 525, 46], tnum: true },
];
const ONLY = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const FONT_ONLY = process.env.FONT_ONLY;

const page = await newPage(1400, 400);
await page.setContent(`<html><head><style>${allFontCss()}
  html,body{margin:0} #t{position:absolute;left:20px;top:20px;white-space:nowrap;padding:12px 16px;line-height:1.4;font-kerning:normal}</style></head>
  <body><div id="t">x</div></body></html>`);
await page.evaluate(async (fams) => { await Promise.all(fams.flatMap((f) => [300, 400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${f}"`)))); }, Object.keys(FONTS));

/** Canvas ink metrics at 100px: width (excluding trailing tracking) and height. */
async function metrics100(fam: string, w: number, ls: number, text: string) {
  return page.evaluate(({ fam, w, ls, text }) => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = `${w} 100px "${fam}"`; (c as any).letterSpacing = `${ls * 100}px`;
    const m = c.measureText(text);
    return { w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight - ls * 100, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
  }, { fam, w, ls, text });
}
async function render(fam: string, w: number, ls: number, size: number, text: string, fg: RGB, bg: RGB, sub = 0) {
  await page.evaluate(({ fam, w, ls, size, text, fg, bg, sub, tnum }) => {
    document.body.style.background = `rgb(${bg})`;
    const t = document.getElementById('t')!;
    t.textContent = text;
    Object.assign(t.style, { left: `${20 + sub}px`, top: `${20 + sub}px`, fontFamily: `"${fam}"`, fontWeight: String(w), letterSpacing: `${ls}em`, fontSize: `${size}px`, color: `rgb(${fg})`, background: `rgb(${bg})`, fontVariantNumeric: tnum ? 'tabular-nums' : 'normal' });
  }, { fam, w, ls, size, text, fg, bg, sub, tnum: TNUM });
  return shotEl(page, '#t');
}
let TNUM = false;
function mass(png: PNG, fg: RGB, bg: RGB) {
  const full = dist(fg, bg); let m = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) m += Math.min(1, dist(px(png, x, y), bg) / full);
  return m;
}

type Fit = { font: string; weight: number; ls: number; size: number; pctInk: number; pctArea: number; inkHRef: number; inkHCand: number; std: { weight: number; pctInk: number } };
const results: Record<string, Fit[]> = {};
const cmpRows: Parameters<typeof sheet>[2] = [];
const pjsRows: Parameters<typeof sheet>[2] = [];

for (const s of SAMPLES.filter((x) => !ONLY || ONLY.has(x.id))) {
  const ref = crop(loadPng(s.file), { x: s.r[0], y: s.r[1], w: s.r[2], h: s.r[3] });
  const bg = modeColor(ref), fg = inkColor(ref, bg);
  const rb = inkBBox(ref, bg)!; const refMass = mass(ref, fg, bg); TNUM = !!s.tnum;
  const fits: Fit[] = []; const imgs: Record<string, ReturnType<typeof alignedDiff>> = {};

  for (const fam of Object.keys(FONTS).filter((f) => !FONT_ONLY || f === FONT_ONLY)) {
    // geometry for a given weight: size + tracking
    const geom0 = async (w: number) => {
      if (!s.caps) { const m = await metrics100(fam, w, 0, s.text); return { size: (100 * rb.w) / DPR / m.w, ls: 0 }; }
      const m0 = await metrics100(fam, w, 0, s.text);
      const size = (100 * rb.h) / DPR / m0.h;                       // cap height pins the size
      const n = [...s.text].length - 1;
      const ls = (rb.w / DPR - (m0.w * size) / 100) / n / size;     // remaining width is tracking
      return { size, ls: Math.round(ls * 200) / 200 };
    };
    // canvas metrics ignore OpenType features (tnum) and differ slightly from DOM layout:
    // correct once from the actual rendered ink box.
    const geom = async (w: number) => {
      const g = await geom0(w);
      const c = await render(fam, w, g.ls, g.size, s.text, fg, bg); const cb = inkBBox(c, bg)!;
      if (!s.caps) return { size: (g.size * rb.w) / cb.w, ls: 0 };
      const size = (g.size * rb.h) / cb.h; const n = [...s.text].length - 1;
      const ls = g.ls + (rb.w - (cb.w * size) / g.size) / DPR / n / size;
      return { size, ls: Math.round(ls * 200) / 200 };
    };
    // 1) mass curve over weights -> interpolate weight where mass ratio == 1
    const curve: { w: number; r: number }[] = [];
    for (let w = 250; w <= 750; w += 50) {
      const lo = +FONTS[fam].range.split(' ')[0], hi = +FONTS[fam].range.split(' ')[1]; if (w < lo || w > hi) continue;
      const g = await geom(w); const c = await render(fam, w, g.ls, g.size, s.text, fg, bg);
      curve.push({ w, r: mass(c, fg, bg) / refMass });
    }
    let wStar = curve[0].w;
    for (let i = 0; i < curve.length - 1; i++) if ((curve[i].r - 1) * (curve[i + 1].r - 1) <= 0) { const a = curve[i], b = curve[i + 1]; wStar = a.w + ((1 - a.r) / (b.r - a.r)) * (b.w - a.w); break; }
    if (curve.every((c) => c.r > 1)) wStar = curve[0].w; if (curve.every((c) => c.r < 1)) wStar = curve[curve.length - 1].w;
    wStar = Math.round(wStar / 10) * 10;
    // 2) score at w* with sub-pixel offset search
    const score = async (w: number) => {
      const g = await geom(w); let best: ReturnType<typeof alignedDiff> | null = null; let cb = rb;
      for (const sub of [0, 1 / 6]) { const c = await render(fam, w, g.ls, g.size, s.text, fg, bg, sub); const d = alignedDiff(ref, c, bg); if (!best || d.mismatch < best.mismatch) { best = d; cb = inkBBox(c, bg)!; } }
      return { d: best!, g, cb };
    };
    const a = await score(wStar);
    const lo = Math.max(300, Math.floor(wStar / 100) * 100), hi = Math.min(800, Math.ceil(wStar / 100) * 100);
    const sl = await score(lo), sh = hi === lo ? sl : await score(hi);
    const stdW = sl.d.mismatch <= sh.d.mismatch ? lo : hi; const b = stdW === lo ? sl : sh;
    if (fam === "Plus Jakarta Sans") console.log(`    [${s.id}] w${lo}: ${sl.d.pctInk.toFixed(2)}%  w${hi}: ${sh.d.pctInk.toFixed(2)}%`);
    fits.push({ font: fam, weight: wStar, ls: a.g.ls, size: +a.g.size.toFixed(2), pctInk: +a.d.pctInk.toFixed(2), pctArea: +a.d.pctArea.toFixed(2), inkHRef: rb.h, inkHCand: a.cb.h, std: { weight: stdW, pctInk: +b.d.pctInk.toFixed(2) } });
    imgs[fam] = a.d;
  }
  fits.sort((a, b) => a.pctInk - b.pctInk);
  results[s.id] = fits;
  console.log(`\n${s.id}  "${s.text}"  fg ${hex(fg)} bg ${hex(bg)}  ref ink ${rb.w}x${rb.h}`);
  for (const f of fits) console.log(`  ${f.font.padEnd(18)} w${String(f.weight).padEnd(4)} ls ${f.ls}em  ${f.size}px  ink-mismatch ${String(f.pctInk).padEnd(6)}% area ${String(f.pctArea).padEnd(5)}%  inkH ${f.inkHRef}/${f.inkHCand}   [std w${f.std.weight}: ${f.std.pctInk}%]`);
  cmpRows.push({ label: s.id, note: `"${s.text}"\nbest: ${fits[0].font}`, imgs: [{ cap: 'reference', png: imgs['Plus Jakarta Sans'].ref }, ...fits.map((x) => x.font).map((f) => { const r = fits.find((x) => x.font === f)!; return { cap: `${f} w${r.weight} · ${r.pctInk}%`, png: imgs[f].cand }; })] });
  const p = fits.find((x) => x.font === 'Plus Jakarta Sans')!;
  pjsRows.push({ label: s.id, note: `w${p.weight} · ${p.size}px · ls ${p.ls}em\nink ${p.pctInk}% · area ${p.pctArea}%`, imgs: [{ cap: 'reference', png: imgs['Plus Jakarta Sans'].ref }, { cap: 'Plus Jakarta Sans', png: imgs['Plus Jakarta Sans'].cand }, { cap: 'diff (red = mismatch, yellow = AA ignored)', png: imgs['Plus Jakarta Sans'].diff }] });
}

fs.writeFileSync(path.join(OUT, FONT_ONLY ? 'fontfit-pjs.json' : 'fontfit.json'), JSON.stringify(results, null, 2));
console.log('\n=== mean ink-mismatch % (mass-matched weight) ===');
for (const f of FONT_ONLY ? [FONT_ONLY] : Object.keys(FONTS)) {
  const v = Object.values(results).map((r) => r.find((x) => x.font === f)!.pctInk);
  const wins = Object.values(results).filter((r) => r[0].font === f).length;
  console.log(`  ${f.padEnd(18)} mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}%   best on ${wins}/${v.length}`);
}
if (!FONT_ONLY) console.log(await sheet('font-comparison.png', 'Font candidates: reference vs best fit per font (ink-mismatch %)', cmpRows, 0.5));
console.log(await sheet('font-pjs-diff.png', 'Plus Jakarta Sans: reference / render / pixel diff', pjsRows, 0.5));
await closeBrowser();
