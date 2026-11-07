// Default avatar, v2: clean rebuild of the region hidden by the camera badge.
// Source of truth for the hidden region = the Home tab-bar avatar (same artwork, no badge).
//  1. Locally register tab-bar avatar -> profile avatar (offset + scale) using the visible ring around the badge.
//  2. Rebuild hidden pixels by 4x4 supersampling the registered tab avatar, snapping every subsample to the
//     local flat palette (colours present right next to the badge), then averaging -> clean anti-aliased edges.
//  3. Blend band starts OUTSIDE the badge's card-coloured ring (v1 blended into the ring -> faint dark arc).
import path from 'node:path';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { loadPng, px, dist, crop, place, savePng, sheet, closeBrowser, REF, OUT, type RGB } from './lib.ts';

const prof = loadPng('07-profile.png'), home = loadPng('04-home.png');
// measured in avatar.ts / avatar-probe.ts (device px)
const P = { cx: 206.46, cy: 433.41, r: 99.18 };
const B = { cx: 278.54, cy: 505.68 };
const OCC = 42, BLEND = 3;                 // avatar pixels resume at ~39-41 from badge centre (ring AA varies by direction); blend 42..45
const T = { cx: 926.47, cy: 2220.52, r: 32.57 };

const bil = (img: PNG, x: number, y: number): RGB => {
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0;
  const c = [px(img, x0, y0), px(img, x0 + 1, y0), px(img, x0, y0 + 1), px(img, x0 + 1, y0 + 1)];
  return [0, 1, 2].map((k) => c[0][k] * (1 - fx) * (1 - fy) + c[1][k] * fx * (1 - fy) + c[2][k] * (1 - fx) * fy + c[3][k] * fx * fy) as RGB;
};
const dB = (x: number, y: number) => Math.hypot(x - B.cx, y - B.cy);
const inAvatar = (x: number, y: number, m = 2) => Math.hypot(x - P.cx, y - P.cy) < P.r - m;

// 1) registration over the visible annulus around the badge
const ann: [number, number][] = [];
for (let y = Math.floor(B.cy - 62); y <= B.cy + 62; y++) for (let x = Math.floor(B.cx - 62); x <= B.cx + 62; x++) { const d = dB(x + 0.5, y + 0.5); if (d > OCC + BLEND && d < 62 && inAvatar(x + 0.5, y + 0.5, 3)) ann.push([x, y]); }
let reg = { ox: 0, oy: 0, s: 1, err: Infinity };
const mapT = (x: number, y: number, r: typeof reg) => [T.cx + r.ox + ((x - P.cx) / P.r) * T.r * r.s, T.cy + r.oy + ((y - P.cy) / P.r) * T.r * r.s];
for (let s = 0.96; s <= 1.04; s += 0.01) for (let ox = -1.5; ox <= 1.5; ox += 0.25) for (let oy = -1.5; oy <= 1.5; oy += 0.25) {
  let e = 0; const r = { ox, oy, s, err: 0 };
  for (let i = 0; i < ann.length; i += 3) { const [x, y] = ann[i]; const [tx, ty] = mapT(x + 0.5, y + 0.5, r); e += dist(bil(home, tx - 0.5, ty - 0.5), px(prof, x, y)); }
  if (e < reg.err) reg = { ...r, err: e };
}
console.log(`registration: offset ${reg.ox},${reg.oy} tab px, scale ${reg.s.toFixed(2)}, mean colour error ${(reg.err / Math.ceil(ann.length / 3)).toFixed(1)}`);

// 2) local palette: k-means over visible pixels right next to the badge
const near = ann.filter(([x, y]) => dB(x + 0.5, y + 0.5) < OCC + 16).map(([x, y]) => px(prof, x, y));
let K: RGB[] = [near[0], near[Math.floor(near.length / 4)], near[Math.floor(near.length / 2)], near[Math.floor((3 * near.length) / 4)], near[near.length - 1]];
for (let it = 0; it < 20; it++) {
  const acc = K.map(() => [0, 0, 0, 0]);
  for (const c of near) { let bi = 0, bd = 1e9; K.forEach((k, i) => { const d = dist(c, k); if (d < bd) { bd = d; bi = i; } }); acc[bi][0] += c[0]; acc[bi][1] += c[1]; acc[bi][2] += c[2]; acc[bi][3]++; }
  K = acc.map((a, i) => (a[3] ? ([a[0] / a[3], a[1] / a[3], a[2] / a[3]].map(Math.round) as RGB) : K[i]));
}
// drop clusters that are just anti-aliasing blends (tiny population)
const counts = K.map(() => 0); for (const c of near) { let bi = 0, bd = 1e9; K.forEach((k, i) => { const d = dist(c, k); if (d < bd) { bd = d; bi = i; } }); counts[bi]++; }
const PAL = K.filter((_, i) => counts[i] > near.length * 0.04);
console.log('local palette:', PAL.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')).join(' '), ' counts', counts.join(','));
const snap = (c: RGB) => { let b = PAL[0], bd = 1e9; for (const k of PAL) { const d = dist(c, k); if (d < bd) { bd = d; b = k; } } return b; };

// 3) build
// optional v1 image for the before/after review sheet (gitignored output; absent on a fresh clone)
const v1Path = path.join(OUT, 'avatar-v1-keep.png');
const before = fs.existsSync(v1Path) ? loadPng(v1Path) : null;

const D = Math.round(2 * P.r), out = new PNG({ width: D, height: D }); let rebuilt = 0;
const X0 = Math.round(P.cx - D / 2), Y0 = Math.round(P.cy - D / 2); // 107, 334
console.log(`grid origin ${X0},${Y0}; circle centre inside the file at (${(P.cx - X0).toFixed(2)}, ${(P.cy - Y0).toFixed(2)}) of ${D}`);
const SS = 4;
for (let y = 0; y < D; y++) for (let x = 0; x < D; x++) {
  // pixel grid aligned with the screenshot (X0,Y0 integer) -> unpatched pixels are exact copies
  const sx = X0 + x + 0.5, sy = Y0 + y + 0.5, o = (y * D + x) * 4;
  const rr = Math.hypot(sx - P.cx, sy - P.cy); const alpha = Math.max(0, Math.min(1, P.r - rr + 0.5));
  if (alpha <= 0) { out.data[o + 3] = 0; continue; }
  const k = rr > P.r - 1.5 ? (P.r - 1.5) / rr : 1; const qx = P.cx + (sx - P.cx) * k, qy = P.cy + (sy - P.cy) * k;
  const orig = bil(prof, qx - 0.5, qy - 0.5);
  const d = dB(qx, qy); let c: RGB = orig;
  if (d < OCC + BLEND) {
    // supersampled, palette-snapped reconstruction
    const s = [0, 0, 0];
    for (let j = 0; j < SS; j++) for (let i = 0; i < SS; i++) {
      let ux = sx - 0.5 + (i + 0.5) / SS, uy = sy - 0.5 + (j + 0.5) / SS;
      const ur = Math.hypot(ux - P.cx, uy - P.cy); if (ur > P.r - 1.5) { const f = (P.r - 1.5) / ur; ux = P.cx + (ux - P.cx) * f; uy = P.cy + (uy - P.cy) * f; }
      const [tx, ty] = mapT(ux, uy, reg); const v = snap(bil(home, tx - 0.5, ty - 0.5)); s[0] += v[0]; s[1] += v[1]; s[2] += v[2];
    }
    const rec = s.map((v) => v / (SS * SS)) as RGB;
    const w = d <= OCC ? 0 : (d - OCC) / BLEND; // 0 = fully rebuilt, 1 = original
    c = [0, 1, 2].map((i) => orig[i] * w + rec[i] * (1 - w)) as RGB; rebuilt++;
  }
  out.data[o] = Math.round(c[0]); out.data[o + 1] = Math.round(c[1]); out.data[o + 2] = Math.round(c[2]); out.data[o + 3] = Math.round(alpha * 255);
}
fs.writeFileSync(path.join(REF, 'assets/avatar-default.png'), PNG.sync.write(out));
console.log(`saved reference-ui/assets/avatar-default.png (${D}x${D}); ${rebuilt} px rebuilt/blended`);

// review: 100% before/after on dark + light card, next to the screenshot; plus a 4x zoom of the region
const card = (img: PNG, bg: RGB) => place(img, D + 16, D + 16, 8, 8, bg);
const shot = crop(prof, { x: Math.round(P.cx - P.r - 8), y: Math.round(P.cy - P.r - 8), w: D + 16, h: D + 16 });
const zoom = (img: PNG) => place(crop(img, { x: 110, y: 110, w: 88, h: 88 }), 88, 88, 0, 0, [24, 27, 36]);
console.log(await sheet('avatar-before-after.png', 'Default avatar at 100% (198 px = 66 CSS px @3x): screenshot / before (v1) / after (v2)', [
  { label: 'Dark card #181B24', imgs: [{ cap: 'screenshot', png: shot }, ...(before ? [{ cap: 'before (v1)', png: card(before, [24, 27, 36]) }] : []), { cap: 'after (v2)', png: card(out, [24, 27, 36]) }] },
  { label: 'Light card #FFFFFF', imgs: [...(before ? [{ cap: 'before (v1)', png: card(before, [255, 255, 255]) }] : []), { cap: 'after (v2)', png: card(out, [255, 255, 255]) }] },
], 1));
console.log(await sheet('avatar-before-after-zoom.png', 'Rebuilt region, 4x zoom: screenshot / before (v1) / after (v2)', [
  { label: 'bottom-right', imgs: [{ cap: 'screenshot (badge on top)', png: crop(prof, { x: Math.round(P.cx - D / 2) + 110, y: Math.round(P.cy - D / 2) + 110, w: 88, h: 88 }) }, ...(before ? [{ cap: 'before (v1)', png: zoom(before) }] : []), { cap: 'after (v2)', png: zoom(out) }] },
], 4));
void OUT;
await closeBrowser();
