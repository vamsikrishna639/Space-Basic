// Vectorise the icons that no library matches (plus the camera glyph) into SVG masks with fill="currentColor".
//
// Steps (as approved):
//  1. coverage: per screenshot pixel, how far it sits from the background toward the icon colour (0..1)
//  2. upscale the coverage field 8x (bilinear)
//  3. threshold at 50% (tuned per icon only if the traced icon comes out thinner/thicker; value recorded)
//  4. trace with potrace, save SVG, re-render at the measured size in the Linux image, pixel-diff vs screenshot
//
// Tooling only: potrace (GPL-2.0) lives in tools/ui-analysis and never ships. The generated SVG paths are output.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { PNG } from 'pngjs';
import { loadPng, crop, modeColor, inkColor, inkBBox, alignedDiff, newPage, closeBrowser, shotEl, sheet, dist, px, hex, ROOT, OUT, DPR, type RGB, type Rect } from './lib.ts';
import { ICONS } from './icon-specs.ts';

const require = createRequire(import.meta.url);
const potrace = require('potrace');
const DEST = path.join(ROOT, 'reference-ui/assets/icons/cutout');
fs.mkdirSync(DEST, { recursive: true });

// crop id -> output name; camera uses the approved badge-centred 42x42 box so the badge CSS stays unchanged
const CUTOUTS: { id: string; name: string; box?: Rect; maxR?: { cx: number; cy: number; r: number } }[] = [
  { id: 'welcome-bed', name: 'bed-welcome' }, { id: 'welcome-utensils', name: 'utensils-crossed' },
  { id: 'help-question', name: 'question-circle' }, { id: 'help-video', name: 'video' },
  { id: 'profile-bed', name: 'bed-room' }, { id: 'profile-phone', name: 'phone' }, { id: 'profile-qr', name: 'qr-code' },
  { id: 'profile-user', name: 'user' }, { id: 'profile-key', name: 'key' }, { id: 'profile-shield', name: 'shield-check' },
  { id: 'profile-settings', name: 'settings' }, { id: 'profile-info', name: 'info-circle' }, { id: 'profile-logout', name: 'logout' },
  { id: 'settings-accessibility', name: 'accessibility' }, { id: 'settings-gauge', name: 'gauge' }, { id: 'settings-trash', name: 'trash' },
  { id: 'profile-camera', name: 'camera', box: { x: 257, y: 485, w: 42, h: 42 }, maxR: { cx: 278.49, cy: 505.52, r: 30.5 } },
];
// Approved fixed thresholds (skip auto-tuning). FORCE_T env overrides everything for exploratory runs.
const FIXED_T: Record<string, number> = {
  'help-question': 0.475, 'profile-user': 0.475, 'profile-logout': 0.475, // auto-tuned (thin at 0.5), approved
  'settings-gauge': 0.45,  // auto-tuned; 0.44/0.43 tested: thicker (mass 1.015/1.027) and worse coverage error -> kept
  'profile-qr': 0.44,      // user: lower toward mass 1.0. 0.47..0.43 swept; 0.44 = mass 0.970, best coverage error near 0.45
};
const FORCE_T = process.env.FORCE_T ? Number(process.env.FORCE_T) : null;
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const UP = 8;

function coverageField(img: PNG, bg: RGB, fg: RGB, allow: (x: number, y: number) => boolean) {
  const W = img.width, H = img.height, f = new Float32Array(W * H);
  const d = [fg[0] - bg[0], fg[1] - bg[1], fg[2] - bg[2]], den = d[0] ** 2 + d[1] ** 2 + d[2] ** 2;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (!allow(x, y)) continue;
    const c = px(img, x, y);
    const a = ((c[0] - bg[0]) * d[0] + (c[1] - bg[1]) * d[1] + (c[2] - bg[2]) * d[2]) / den;
    f[y * W + x] = Math.max(0, Math.min(1, a));
  }
  return f;
}
const bilinear = (f: Float32Array, W: number, H: number, x: number, y: number) => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const g = (xx: number, yy: number) => (xx < 0 || yy < 0 || xx >= W || yy >= H ? 0 : f[yy * W + xx]);
  return g(x0, y0) * (1 - fx) * (1 - fy) + g(x0 + 1, y0) * fx * (1 - fy) + g(x0, y0 + 1) * (1 - fx) * fy + g(x0 + 1, y0 + 1) * fx * fy;
};
function trace(bitmap: PNG): Promise<string> {
  return new Promise((res, rej) => {
    const t = new potrace.Potrace();
    t.setParameters({ threshold: 128, blackOnWhite: true, turdSize: 2 * UP, alphaMax: 1, optCurve: true, optTolerance: 0.2 });
    t.loadImage(PNG.sync.write(bitmap), (err: Error | null) => { if (err) return rej(err); const tag: string = t.getPathTag(); const m = tag.match(/ d="([^"]+)"/); res(m ? m[1] : ''); });
  });
}
// contrast-independent: compare coverage maps of the aligned images (works for white-on-pastel, where pixelmatch is blind)
const covErr = (a: PNG, b: PNG, fg: RGB, bg: RGB) => { const d = [fg[0] - bg[0], fg[1] - bg[1], fg[2] - bg[2]], den = d[0] ** 2 + d[1] ** 2 + d[2] ** 2; const cv = (p: PNG, i: number) => Math.max(0, Math.min(1, ((p.data[i] - bg[0]) * d[0] + (p.data[i + 1] - bg[1]) * d[1] + (p.data[i + 2] - bg[2]) * d[2]) / den)); let e = 0, u = 0; for (let i = 0; i < a.data.length; i += 4) { const x = cv(a, i), y = cv(b, i); e += Math.abs(x - y); u += Math.max(x, y); } return (100 * e) / u; };
const mass = (p: PNG, fg: RGB, bg: RGB) => { const f = dist(fg, bg); let m = 0; for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) m += Math.min(1, dist(px(p, x, y), bg) / f); return m; };

const page = await newPage(400, 400);
await page.setContent(`<html><body style="margin:0"><div id="t" style="position:absolute;left:20px;top:20px;padding:6px;line-height:0"></div></body></html>`);
async function renderSvg(svg: string, sizeCss: number, fg: RGB, bg: RGB, sub = 0) {
  await page.evaluate(({ svg, sizeCss, fg, bg, sub }) => {
    document.body.style.background = `rgb(${bg})`; const t = document.getElementById('t')!;
    Object.assign(t.style, { background: `rgb(${bg})`, color: `rgb(${fg})`, left: `${20 + sub}px`, top: `${20 + sub}px` });
    t.innerHTML = svg.replace('<svg ', `<svg width="${sizeCss}" height="${sizeCss}" `);
  }, { svg, sizeCss, fg, bg, sub });
  return shotEl(page, '#t');
}

type Row = { name: string; id: string; threshold: number; boxCss: number; covErr: number; pctInk: number; pctArea: number; massRatio: number; at50?: { pctInk: number; massRatio: number } };
const results: Row[] = []; const rows: Parameters<typeof sheet>[2] = [];
for (const c of CUTOUTS.filter((x) => !ONLY || ONLY.has(x.id))) {
  const spec = ICONS.find((s) => s.id === c.id)!;
  const full = loadPng(spec.file);
  const sb: Rect = { x: spec.box[0], y: spec.box[1], w: spec.box[2], h: spec.box[3] };
  const ref = crop(full, sb); const bg = modeColor(ref), fg = inkColor(ref, bg);
  // square box (device px): camera uses the approved badge box; others centre on the ink box with 3 px padding
  let box = c.box;
  if (!box) {
    const ib = inkBBox(ref, bg)!; const side = Math.ceil((Math.max(ib.w, ib.h) + 6) / DPR) * DPR;
    box = { x: Math.round(sb.x + ib.x + ib.w / 2 - side / 2), y: Math.round(sb.y + ib.y + ib.h / 2 - side / 2), w: side, h: side };
  }
  const src = crop(full, box);
  // 1. coverage (only pixels inside the spec crop / badge disc count; everything else is background)
  const allow = (x: number, y: number) => {
    const gx = box!.x + x, gy = box!.y + y;
    if (c.maxR) return Math.hypot(gx + 0.5 - c.maxR.cx, gy + 0.5 - c.maxR.cy) <= c.maxR.r;
    return gx >= sb.x && gy >= sb.y && gx < sb.x + sb.w && gy < sb.y + sb.h;
  };
  const cov = coverageField(src, bg, fg, allow);
  const build = async (t: number) => {
    // 2. upscale 8x  3. threshold
    const S = box!.w * UP, bmp = new PNG({ width: S, height: S });
    for (let v = 0; v < S; v++) for (let u = 0; u < S; u++) {
      const a = bilinear(cov, box!.w, box!.h, (u + 0.5) / UP - 0.5, (v + 0.5) / UP - 0.5);
      const o = (v * S + u) * 4, k = a >= t ? 0 : 255;
      bmp.data[o] = bmp.data[o + 1] = bmp.data[o + 2] = k; bmp.data[o + 3] = 255;
    }
    // 4. trace + save
    const d = await trace(bmp);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" fill="currentColor" aria-hidden="true"><path fill-rule="evenodd" d="${d}"/></svg>`;
    // re-render at the measured size and diff (ink-box aligned, AA detection on)
    let best: ReturnType<typeof alignedDiff> | null = null; let cand: PNG | null = null;
    for (const sub of [0, 1 / 6]) { const r = await renderSvg(svg, box!.w / DPR, fg, bg, sub); const df = alignedDiff(ref, r, bg, { range: 3 }); if (!best || df.mismatch < best.mismatch) { best = df; cand = r; } }
    return { svg, d: best!, massRatio: mass(cand!, fg, bg) / mass(ref, fg, bg), covE: covErr(best!.ref, best!.cand, fg, bg) };
  };
  const base = await build(0.5);
  let chosen = base, t = 0.5;
  const fixed = FORCE_T ?? FIXED_T[c.id];
  if (fixed != null) { t = fixed; chosen = await build(fixed); }
  else if (Math.abs(base.massRatio - 1) > 0.03) {
    // traced icon is visibly thinner/thicker: tune the threshold for this icon only (criterion: coverage error, contrast-independent)
    for (let tt = 0.3; tt <= 0.701; tt += 0.025) { const r = await build(+tt.toFixed(3)); if (r.covE < chosen.covE) { chosen = r; t = +tt.toFixed(3); } }
  }
  fs.writeFileSync(path.join(DEST, `${c.name}.svg`), chosen.svg + '\n');
  const row: Row = { name: c.name, id: c.id, threshold: t, boxCss: +(box.w / DPR).toFixed(2), covErr: +chosen.covE.toFixed(1), pctInk: +chosen.d.pctInk.toFixed(1), pctArea: +chosen.d.pctArea.toFixed(2), massRatio: +chosen.massRatio.toFixed(3) };
  if (t !== 0.5) row.at50 = { pctInk: +base.covE.toFixed(1), massRatio: +base.massRatio.toFixed(3) };
  results.push(row);
  console.log(`${c.name.padEnd(18)} ${c.id.padEnd(24)} fg ${hex(fg)} bg ${hex(bg)}  box ${row.boxCss}px  threshold ${t}  coverage-err ${row.covErr}%  ink ${row.pctInk}%  area ${row.pctArea}%  mass ${row.massRatio}` + (row.at50 ? `   (at 0.5: coverage-err ${row.at50.pctInk}%, mass ${row.at50.massRatio})` : ''));
  rows.push({ label: c.name, note: `${c.id}\nbox ${row.boxCss} CSS px\nthreshold ${t}${t !== 0.5 ? ' (tuned)' : ''}\nink mismatch ${row.pctInk}%\nmass ratio ${row.massRatio}`,
    imgs: [{ cap: 'screenshot', png: chosen.d.ref }, { cap: 'traced SVG', png: chosen.d.cand }, { cap: 'diff', png: chosen.d.diff }] });
}
fs.writeFileSync(path.join(OUT, 'trace-icons.json'), JSON.stringify(results, null, 2));
console.log(await sheet('icon-cutouts.png', 'Vectorised cut-out icons (potrace, 8x, fill=currentColor): screenshot / traced SVG / diff', rows, 2));
await closeBrowser();
