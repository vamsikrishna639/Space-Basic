// Camera badge: measure geometry, extract the real camera glyph from the screenshot, and prototype
// avatar + badge (badge = separate element on top) on dark and light cards; diff vs the screenshot.
import path from 'node:path';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { loadPng, px, dist, hex, crop, newPage, closeBrowser, dataUrl, sheet, REF, DPR, type RGB } from './lib.ts';

const prof = loadPng('07-profile.png');
const CARD: RGB = [0x18, 0x1b, 0x24];
// interior blue = most common colour inside the disc (approx centre/radius from the probe), glyph excluded by the mode
const BLUE: RGB = (() => { const m = new Map<string, number>(); for (let y = 480; y < 532; y++) for (let x = 252; x < 305; x++) { if (Math.hypot(x - 278.5, y - 505.6) > 29) continue; const c = px(prof, x, y); const k = c.join(","); m.set(k, (m.get(k) ?? 0) + 1); } return [...m.entries()].sort((a, b) => b[1] - a[1])[0][0].split(",").map(Number) as RGB; })();
const P = { cx: 206.46, cy: 433.41, r: 99.18 };

// --- fit the blue disc: walk outward from the approximate centre, find where blue ends (all angles; the ring surrounds it)
function fit(pts: [number, number][]) {
  let Sxx = 0, Sxy = 0, Syy = 0, Sx = 0, Sy = 0, n = 0, Sxz = 0, Syz = 0, Sz = 0;
  for (const [x, y] of pts) { const z = x * x + y * y; Sxx += x * x; Sxy += x * y; Syy += y * y; Sx += x; Sy += y; n++; Sxz += x * z; Syz += y * z; Sz += z; }
  const A = [[Sxx, Sxy, Sx], [Sxy, Syy, Sy], [Sx, Sy, n]], b = [-Sxz, -Syz, -Sz];
  const det = (m: number[][]) => m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) - m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) + m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
  const d0 = det(A); const s = [0, 1, 2].map((i) => det(A.map((r, ri) => r.map((v, ci) => (ci === i ? b[ri] : v)))) / d0);
  const cx = -s[0] / 2, cy = -s[1] / 2; return { cx, cy, r: Math.sqrt(cx * cx + cy * cy - s[2]) };
}
const blueEdge: [number, number][] = [], ringOuter: [number, number][] = [];
for (let a = 0; a < 360; a += 4) {
  const t = (a * Math.PI) / 180, dx = Math.cos(t), dy = Math.sin(t);
  // blue edge: 50% crossing between BLUE and CARD (sub-pixel via linear interpolation along the ray)
  let prev = 0;
  for (let s = 20; s < 40; s += 0.25) {
    const c = px(prof, Math.round(278.5 + dx * s), Math.round(505.7 + dy * s));
    const f = Math.min(1, Math.max(0, 1 - dist(c, BLUE) / dist(CARD, BLUE))); // 1 = blue
    if (prev >= 0.5 && f < 0.5) { blueEdge.push([278.5 + dx * s, 505.7 + dy * s]); break; } prev = f;
  }
  // ring outer edge (only toward the avatar, where something non-card follows the ring)
  let inRing = false;
  for (let s = 30; s < 48; s += 0.25) {
    const x = 278.5 + dx * s, y = 505.7 + dy * s;
    if (Math.hypot(x - P.cx, y - P.cy) > P.r - 3) { break; }
    const c = px(prof, Math.round(x), Math.round(y));
    if (!inRing && dist(c, CARD) < 10) inRing = true;
    else if (inRing && dist(c, CARD) > 30) { ringOuter.push([x, y]); break; }
  }
}
const Bd = fit(blueEdge);
const ringR = ringOuter.reduce((s, [x, y]) => s + Math.hypot(x - Bd.cx, y - Bd.cy), 0) / ringOuter.length;
const css = (v: number) => +(v / DPR).toFixed(2);
console.log(`blue disc: centre ${Bd.cx.toFixed(2)},${Bd.cy.toFixed(2)}  r ${Bd.r.toFixed(2)} dev = diameter ${css(2 * Bd.r)} CSS; colour ${hex(BLUE)}`);
console.log(`ring outer radius ${ringR.toFixed(2)} dev (${ringOuter.length} samples) => ring width ${css(ringR - Bd.r)} CSS; badge outer diameter ${css(2 * ringR)} CSS`);
console.log(`badge centre - avatar centre = (${css(Bd.cx - P.cx)}, ${css(Bd.cy - P.cy)}) CSS; avatar diameter ${css(2 * P.r)}`);

// --- camera glyph: measure its ink box; the badge renders the approved vectorised cut-out camera.svg
let gx0 = 1e9, gy0 = 1e9, gx1 = -1, gy1 = -1;
for (let y = Math.round(Bd.cy - 20); y < Bd.cy + 20; y++) for (let x = Math.round(Bd.cx - 20); x < Bd.cx + 20; x++) {
  if (Math.hypot(x - Bd.cx, y - Bd.cy) > Bd.r - 3) continue;
  if (dist(px(prof, x, y), BLUE) > 60) { gx0 = Math.min(gx0, x); gy0 = Math.min(gy0, y); gx1 = Math.max(gx1, x); gy1 = Math.max(gy1, y); }
}
const gcx = (gx0 + gx1 + 1) / 2, gcy = (gy0 + gy1 + 1) / 2;
console.log(`camera glyph ink ${gx1 - gx0 + 1}x${gy1 - gy0 + 1} dev = ${css(gx1 - gx0 + 1)}x${css(gy1 - gy0 + 1)} CSS; glyph centre - badge centre = (${css(gcx - Bd.cx)}, ${css(gcy - Bd.cy)}) CSS`);
const cameraSvg = fs.readFileSync(path.join(REF, "assets/icons/cutout/camera.svg"), "utf8").trim();

// --- prototype: avatar (66.12) + badge component; ring colour = card surface token
const avatar = PNG.sync.read(fs.readFileSync(path.join(REF, 'assets/avatar-default.png')));
// component spec (rounded from the measurements above): avatar 66, disc 22, ring 2, badge box right/bottom -4
const A = 66, BD = 22, RW = 2, INSET = -4;

const html = (cardHex: string, left: number, top: number) => `<html><head><style>
  :root{--surface-card:${cardHex};--badge-bg:${hex(BLUE)}}
  html,body{margin:0;background:var(--surface-card)}
  .avatar{position:absolute;left:${left}px;top:${top}px;width:${A}px;height:${A}px}
  .avatar img{width:100%;height:100%;display:block} /* asset already has an anti-aliased circular alpha */
  /* CameraBadge: separate element, bottom-right of the avatar */
  .badge{position:absolute;box-sizing:content-box;width:${BD}px;height:${BD}px;border-radius:50%;background:var(--badge-bg);
    border:${RW}px solid var(--surface-card);
    right:${INSET}px;bottom:${INSET}px;display:grid;place-items:center}
  .badge svg{width:14px;height:14px;display:block;color:#fff} /* camera.svg: fill=currentColor */
</style></head><body><div class="avatar"><img src="${dataUrl(avatar)}"><div class="badge">${cameraSvg}</div></div></body></html>`;

const page = await newPage(360, 260);
// dark: place exactly where the screenshot has it, then diff the avatar+badge region
await page.setViewportSize({ width: 360, height: 220 });
const R = { x: Math.round(P.cx - P.r - 6), y: Math.round(P.cy - P.r - 6), w: Math.round(2 * P.r + 30), h: Math.round(2 * P.r + 30) };
const BR = { x: Math.round(Bd.cx - ringR - 3), y: Math.round(Bd.cy - ringR - 3), w: Math.round(2 * ringR + 6), h: Math.round(2 * ringR + 6) };
const refC = crop(prof, R);
// sub-pixel placement search for the whole avatar group (device-px steps of 1/6)
let best = { m: Infinity, L: 0, T: 0, full: null as PNG | null };
// The asset sits on the screenshot grid at device (107,334). 107/3 CSS px is not representable in Chrome's
// 1/64-px LayoutUnits (image gets resampled), so render at whole CSS px (36,112) = device (108,336) and
// compare against the render shifted back by (-1,-2) device px.
const SH = { x: 108 - 107, y: 336 - 334 };
const shift = (r: typeof R) => ({ ...r, x: r.x + SH.x, y: r.y + SH.y });
for (const [L, T] of [[36, 112]]) {
  await page.setContent(html(hex(CARD), L, T));
  const full = PNG.sync.read(await page.screenshot());
  const m = pixelmatch(refC.data, crop(full, shift(R)).data, null, R.w, R.h, { threshold: 0.1, includeAA: false });
  if (m < best.m) best = { m, L, T, full };
}
const darkFull = best.full!, L = best.L, Tp = best.T;
const darkC = crop(darkFull, shift(R)), diff = new PNG({ width: R.w, height: R.h });
const mm = pixelmatch(refC.data, darkC.data, diff.data, R.w, R.h, { threshold: 0.1, includeAA: false, alpha: 0.2 });
const bd = new PNG({ width: BR.w, height: BR.h });
const mmB = pixelmatch(crop(prof, BR).data, crop(darkFull, shift(BR)).data, bd.data, BR.w, BR.h, { threshold: 0.1, includeAA: false });
console.log(`best placement: left ${L.toFixed(3)} top ${Tp.toFixed(3)} CSS`);
await page.setContent(html('#FFFFFF', L, Tp));
const lightC = crop(PNG.sync.read(await page.screenshot()), shift(R));
console.log(`\nMISMATCH avatar+badge region ${R.w}x${R.h}: ${(100 * mm / (R.w * R.h)).toFixed(2)}%   badge only ${BR.w}x${BR.h}: ${(100 * mmB / (BR.w * BR.h)).toFixed(2)}%`);
console.log(await sheet('camera-badge.png', `Avatar + CameraBadge at 100% (device px) — avatar+badge mismatch ${(100 * mm / (R.w * R.h)).toFixed(2)}%, badge ${(100 * mmB / (BR.w * BR.h)).toFixed(2)}%`, [
  { label: 'Dark card', note: 'ring = --surface-card #181B24', imgs: [{ cap: 'screenshot', png: refC }, { cap: 'prototype', png: darkC }, { cap: 'diff', png: diff }] },
  { label: 'Light card', note: 'ring = --surface-card #FFFFFF\n(no light Profile screenshot)', imgs: [{ cap: 'prototype', png: lightC }] },
], 1));
await closeBrowser();
