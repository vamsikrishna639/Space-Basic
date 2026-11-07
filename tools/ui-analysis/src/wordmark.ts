// Welcome-screen logo pill: render (blue panel + circle + white pill + cropped logo + "spacebasic" in PJS 800)
// and pixel-diff against the reference.
import path from 'node:path';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { loadPng, crop, px, dist, hex, inkBBox, inkColor, savePng, newPage, closeBrowser, allFontCss, dataUrl, sheet, REF, DPR, type RGB, type Rect } from './lib.ts';

const ref = loadPng('01-welcome.png');
const BLUE: RGB = [0x38, 0x4b, 0xd5], CIRC: RGB = [0x46, 0x58, 0xd8];

// 1) circle: boundary points blue->circle, Kasa least-squares fit
const pts: [number, number][] = [];
for (let y = 90; y <= 570; y += 15) {
  for (let x = 300; x < 1079; x++) { const c = px(ref, x, y); if (dist(c, CIRC) < dist(c, BLUE) && dist(c, CIRC) < 12) { pts.push([x, y]); break; } }
}
for (let x = 560; x <= 1060; x += 25) {           // bottom boundary
  for (let y = 600; y > 90; y--) { const c = px(ref, x, y); if (dist(c, CIRC) < dist(c, BLUE) && dist(c, CIRC) < 12) { pts.push([x, y]); break; } }
}
// solve x^2+y^2 + D x + E y + F = 0
let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, n = 0, Sxz = 0, Syz = 0, Sz = 0;
for (const [x, y] of pts) { const z = x * x + y * y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y; n++; Sxz += x * z; Syz += y * z; Sz += z; }
const A = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]], bvec = [-Sxz, -Syz, -Sz];
const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
const d0 = det(A); const sol = [0, 1, 2].map((i) => det(A.map((r, ri) => r.map((v, ci) => (ci === i ? bvec[ri] : v)))) / d0);
const cx = -sol[0] / 2, cy = -sol[1] / 2, r = Math.sqrt(cx * cx + cy * cy - sol[2]);
console.log(`circle (device px): centre ${cx.toFixed(1)},${cy.toFixed(1)} r ${r.toFixed(1)}  from ${pts.length} pts  => CSS centre ${(cx / DPR).toFixed(2)},${(cy / DPR).toFixed(2)} r ${(r / DPR).toFixed(2)}`);

// 2) logo: crop the supplied PNG to its ink box (no recolouring / redrawing)
const srcLogo = loadPng(path.join(REF, 'assets/logo-spacebasic.png'));
const lb = inkBBox(srcLogo, [255, 255, 255], 40)!;
const logoCropped = crop(srcLogo, lb);
const logoPath = savePng(logoCropped, 'logo-spacebasic-cropped.png');
console.log(`logo source ${srcLogo.width}x${srcLogo.height}, ink box`, lb, `aspect ${(lb.w / lb.h).toFixed(4)} -> saved ${logoPath}`);

// 3) reference measurements
const W: RGB = [255, 255, 255];
const bb = (xa: number, xb: number, ya: number, yb: number) => inkBBox(crop(ref, { x: xa, y: ya, w: xb - xa + 1, h: yb - ya + 1 }), W, 40)!;
const refLogo = bb(100, 222, 262, 380); refLogo.x += 100; refLogo.y += 262;
const refText = bb(224, 600, 262, 380); refText.x += 224; refText.y += 262;
const textCol = inkColor(crop(ref, refText), W);
console.log('ref logo ink', refLogo, `aspect ${(refLogo.w / refLogo.h).toFixed(4)}`, ' ref text ink', refText, 'text colour', hex(textCol));

// 4) compose in the browser
const page = await newPage(360, 160);
const REGION: Rect = { x: 40, y: 228, w: 612, h: 186 }; // pill + margin (device px)
async function compose(o: { pl: number; pt: number; pw: number; ph: number; fs: number; ls: number; tx: number; ty: number; weight: number }) {
  await page.setContent(`<html><head><style>${allFontCss()}
    html,body{margin:0;width:360px;height:160px;overflow:hidden;background:rgb(${BLUE})}
    .circ{position:absolute;left:${(cx - r) / DPR}px;top:${(cy - r) / DPR}px;width:${(2 * r) / DPR}px;height:${(2 * r) / DPR}px;border-radius:50%;background:rgb(${CIRC})}
    .pill{position:absolute;left:${o.pl}px;top:${o.pt}px;width:${o.pw}px;height:${o.ph}px;border-radius:999px;background:#fff}
    .logo{position:absolute;left:${refLogo.x / DPR}px;top:${refLogo.y / DPR}px;width:${refLogo.w / DPR}px;height:${refLogo.h / DPR}px}
    .wm{position:absolute;left:${o.tx}px;top:${o.ty}px;font:${o.weight} ${o.fs}px/1 'Plus Jakarta Sans';letter-spacing:${o.ls}em;color:rgb(${textCol});white-space:nowrap}
  </style></head><body><div class="circ"></div><div class="pill"></div><img class="logo" src="${dataUrl(logoCropped)}"><div class="wm">spacebasic</div></body></html>`);
  await page.evaluate(() => document.fonts.ready);
  return PNG.sync.read(await page.screenshot({ clip: { x: 0, y: 0, width: 360, height: 160 } }));
}
const textInk = (img: PNG) => { const c = crop(img, { x: 224, y: 262, w: 377, h: 119 }); const b = inkBBox(c, W, 40)!; return { ...b, x: b.x + 224, y: b.y + 262 }; };

// pill box from the reference white extents (x 58..634, y 245..396 incl. AA rows)
const base = { pl: 57.5 / DPR, pt: 245 / DPR, pw: 577.5 / DPR, ph: 151 / DPR, weight: 800, ls: 0, fs: 20, tx: refText.x / DPR, ty: refText.y / DPR };
// fit size from ink height (b ascender .. p descender), tracking from width, position from ink box
let o = { ...base };
for (let it = 0; it < 4; it++) {
  const t = textInk(await compose(o));
  const fs = o.fs * (refText.h / t.h);
  const lsPx = (refText.w - (t.w * fs) / o.fs) / DPR / 9; // 10 glyphs -> 9 gaps
  o = { ...o, fs, ls: o.ls + lsPx / fs };
  const t2 = textInk(await compose(o));
  o = { ...o, tx: o.tx + (refText.x - t2.x) / DPR, ty: o.ty + (refText.y - t2.y) / DPR };
}
// small search over pill sub-pixel geometry and text sub-pixel offset
function diffRegion(img: PNG) {
  const a = crop(ref, REGION), b = crop(img, REGION); const d = new PNG({ width: REGION.w, height: REGION.h });
  const m = pixelmatch(a.data, b.data, d.data, REGION.w, REGION.h, { threshold: 0.1, includeAA: false, alpha: 0.2 });
  return { m, pct: (100 * m) / (REGION.w * REGION.h), a, b, d };
}
let best = { o, ...diffRegion(await compose(o)) };
for (const dl of [-0.5, 0, 0.5]) for (const dt of [-0.5, 0, 0.5]) for (const dw of [-0.5, 0, 0.5]) for (const dh of [-0.5, 0, 0.5]) {
  const oo = { ...o, pl: o.pl + dl / DPR, pt: o.pt + dt / DPR, pw: o.pw + dw / DPR, ph: o.ph + dh / DPR };
  const res = diffRegion(await compose(oo)); if (res.m < best.m) best = { o: oo, ...res };
}
for (const dx of [-1, -0.5, 0, 0.5, 1]) for (const dy of [-1, -0.5, 0, 0.5, 1]) {
  const oo = { ...best.o, tx: best.o.tx + dx / DPR, ty: best.o.ty + dy / DPR };
  const res = diffRegion(await compose(oo)); if (res.m < best.m) best = { o: oo, ...res };
}
// weight sanity check around 800 (variable font max is 800)
const wcheck: string[] = [];
for (const w of [700, 750, 800]) { const res = diffRegion(await compose({ ...best.o, weight: w })); wcheck.push(`w${w}: ${res.pct.toFixed(2)}%`); }

// sub-region scores
const sub = (rr: Rect) => { const a = crop(ref, rr), b = crop(best.b === undefined ? ref : (null as any) ?? ref, rr); return [a, b]; };
void sub;
const subScore = async (rr: Rect) => { const img = await compose(best.o); const a = crop(ref, rr), b = crop(img, rr); const d = new PNG({ width: rr.w, height: rr.h }); const m = pixelmatch(a.data, b.data, d.data, rr.w, rr.h, { threshold: 0.1, includeAA: false }); return (100 * m) / (rr.w * rr.h); };
const logoPct = await subScore({ x: refLogo.x - 4, y: refLogo.y - 4, w: refLogo.w + 8, h: refLogo.h + 8 });
const textPct = await subScore({ x: refText.x - 4, y: refText.y - 4, w: refText.w + 8, h: refText.h + 8 });

const O = best.o;
console.log(`\nwordmark fit: Plus Jakarta Sans 800, font-size ${O.fs.toFixed(2)}px, letter-spacing ${O.ls.toFixed(4)}em, ink box ${(refText.x / DPR).toFixed(2)},${(refText.y / DPR).toFixed(2)}`);
console.log(`pill (CSS px): left ${O.pl.toFixed(2)} top ${O.pt.toFixed(2)} (screenshot coords, incl. status bar) w ${O.pw.toFixed(2)} h ${O.ph.toFixed(2)}`);
console.log(`logo (CSS px): left ${(refLogo.x / DPR).toFixed(2)} top ${(refLogo.y / DPR).toFixed(2)} w ${(refLogo.w / DPR).toFixed(2)} h ${(refLogo.h / DPR).toFixed(2)}`);
console.log(`\nMISMATCH pill region ${REGION.w}x${REGION.h}: ${best.pct.toFixed(2)}%   (logo mark box ${logoPct.toFixed(2)}%, wordmark box ${textPct.toFixed(2)}%)`);
console.log('weight check:', wcheck.join('  '));

const z = (p: PNG) => p; // 1:1 device pixels
console.log(await sheet('wordmark-pill.png', `Logo pill — reference / render (PJS 800) / diff — mismatch ${best.pct.toFixed(2)}% of pill region`, [
  { label: 'Logo pill', note: `logo mark ${logoPct.toFixed(2)}%\nwordmark ${textPct.toFixed(2)}%\nwhole region ${best.pct.toFixed(2)}%`, imgs: [{ cap: 'reference', png: z(best.a) }, { cap: 'render', png: z(best.b) }, { cap: 'diff', png: z(best.d) }] },
], 0.8));
await closeBrowser();
