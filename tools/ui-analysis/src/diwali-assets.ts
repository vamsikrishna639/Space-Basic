// Cuts the Diwali Home assets out of reference-ui/home-diwali-dark.png as transparent PNGs (approved by the user:
// raster cut-outs, never redrawn). WRITES ASSET FILES: rerun only on purpose. Byte-identical on re-run.
//   node tools/ui-analysis/src/diwali-assets.ts
//
// Outputs (committed; the lamps contain no personal data):
//   reference-ui/assets/seasonal/diwali-lamps.png       the row of six lamps, 978 x 110 device px (326 x 36.667 CSS)
//   reference-ui/assets/seasonal/diwali-lamp-small.png  the small lamp in the greeting card's tile
// Check sheets (gitignored): tools/ui-analysis/out/diwali-*.png
//
// The six lamps are NOT identical (the flames and their glow differ in height and strength, like flicker frames),
// so the whole row is cut as one strip instead of repeating one lamp. It is centred: 17 CSS px in from each side
// at 360 px, its bottom on the header's bottom edge (device row 539), as in the screenshot.
//
// Transparency (un-compositing from a known background B, per pixel C = a*F + (1-a)*B):
//   - lamp body (distance from B > CORE): a = 1, F = C.
//   - edge pixels next to the body: a = projection of C-B on (nearest body colour - B), at least the minimum below.
//   - everything else (the glow): the smallest a for which F = B + (C-B)/a stays inside 0..255 ("colour to alpha").
// Whatever a is chosen, F = B + (C-B)/a, so the PNG composited on the same background gives back the screenshot's
// pixels (checked below: the largest error is printed). B is the header row's colour (median of the lamp-free
// columns at both sides) for the strip, and the tile's flat colour for the small lamp.
import fs from 'node:fs';
import path from 'node:path';
import { PNG } from 'pngjs';
import { ROOT, OUT, loadPng, px, hex, dist, type RGB } from './lib.ts';

const SRC = 'home-diwali-dark.png';
const DEST = path.join(ROOT, 'reference-ui/assets/seasonal');
const CORE = 80;   // distance from the background above which a pixel is lamp body (glow peaks at ~55)
const NOISE = 4;   // the background's own noise is <= 3.46 (measured): below this, transparent
const EDGE = 2;    // device px around the body treated as its anti-aliased edge

const shot = loadPng(SRC);
const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1]!;

function cut(rect: { x: number; y: number; w: number; h: number }, bgAt: (y: number) => RGB): PNG {
  const { x: X, y: Y, w, h } = rect;
  const C = (x: number, y: number) => px(shot, X + x, Y + y);
  const core = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (dist(C(x, y), bgAt(Y + y)) > CORE) core[y * w + x] = 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = C(x, y), b = bgAt(Y + y), o = (y * w + x) * 4;
    const dl = [c[0] - b[0], c[1] - b[1], c[2] - b[2]];
    let a: number;
    if (core[y * w + x]) a = 1;
    else if (Math.hypot(...dl) < NOISE) a = 0;
    else {
      // the smallest alpha that keeps F inside 0..255
      let amin = 0;
      for (let k = 0; k < 3; k++) amin = Math.max(amin, dl[k]! > 0 ? dl[k]! / (255 - b[k]!) : dl[k]! < 0 ? -dl[k]! / b[k]! : 0);
      a = amin;
      // anti-aliased edge of the body: alpha from the nearest body colour
      let best = Infinity, fc: RGB | null = null;
      for (let j = -EDGE; j <= EDGE; j++) for (let i = -EDGE; i <= EDGE; i++) {
        const xx = x + i, yy = y + j;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h || !core[yy * w + xx]) continue;
        const dd = i * i + j * j; if (dd < best) { best = dd; fc = C(xx, yy); }
      }
      if (fc) {
        const v = [fc[0] - b[0], fc[1] - b[1], fc[2] - b[2]];
        const proj = (dl[0]! * v[0]! + dl[1]! * v[1]! + dl[2]! * v[2]!) / (v[0]! ** 2 + v[1]! ** 2 + v[2]! ** 2);
        a = Math.min(1, Math.max(amin, proj));
      }
    }
    const A = Math.round(a * 255);
    if (A === 0) { out.data[o] = out.data[o + 1] = out.data[o + 2] = out.data[o + 3] = 0; continue; }
    const aq = A / 255;
    for (let k = 0; k < 3; k++) out.data[o + k] = Math.max(0, Math.min(255, Math.round(b[k]! + dl[k]! / aq)));
    out.data[o + 3] = A;
  }
  return out;
}

/** Composites `png` (placed at rect) over the background and returns the largest channel error vs the screenshot. */
function check(png: PNG, rect: { x: number; y: number }, bgAt: (y: number) => RGB): number {
  let worst = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) {
    const o = (y * png.width + x) * 4, a = png.data[o + 3]! / 255, b = bgAt(rect.y + y), c = px(shot, rect.x + x, rect.y + y);
    for (let k = 0; k < 3; k++) worst = Math.max(worst, Math.abs(Math.round(a * png.data[o + k]! + (1 - a) * b[k]!) - c[k]!));
  }
  return worst;
}

// ---- the lamp row on the header gradient ----
// Background per row: median of the lamp-free columns at both sides (x 2..41 and 1038..1077).
const SIDES = [...Array(40).keys()].flatMap((i) => [2 + i, 1038 + i]);
const rowBg = new Map<number, RGB>();
const headerBg = (y: number): RGB => {
  let v = rowBg.get(y);
  if (!v) { v = [0, 1, 2].map((k) => med(SIDES.map((x) => px(shot, x, y)[k]!))) as RGB; rowBg.set(y, v); }
  return v;
};
const ROW = { x: 51, y: 429, w: 978, h: 110 }; // CSS: left 17, top 143, 326 x 36.667; bottom = header bottom 179.667
const lamps = cut(ROW, headerBg);

// ---- the small lamp in the greeting card's tile (flat #3A2280; tile 114 x 114 device px from (99, 655)) ----
const TILE = { x: 99, y: 655, s: 114 };
const tileBg = px(shot, TILE.x + 20, TILE.y + 57);
const flat = () => tileBg;
// ink box inside the tile, away from its rounded corners
let x0 = 1e9, y0 = 1e9, x1 = -1, y1 = -1;
for (let y = TILE.y + 14; y < TILE.y + TILE.s - 14; y++) for (let x = TILE.x + 14; x < TILE.x + TILE.s - 14; x++) {
  if (dist(px(shot, x, y), tileBg) >= NOISE) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
}
const SMALL = { x: x0 - 2, y: y0 - 2, w: x1 - x0 + 5, h: y1 - y0 + 5 };
const small = cut(SMALL, flat);

fs.mkdirSync(DEST, { recursive: true });
fs.writeFileSync(path.join(DEST, 'diwali-lamps.png'), PNG.sync.write(lamps));
fs.writeFileSync(path.join(DEST, 'diwali-lamp-small.png'), PNG.sync.write(small));
const css = (v: number) => (v / 3).toFixed(3);
console.log(`diwali-lamps.png       ${lamps.width} x ${lamps.height} device px from (${ROW.x}, ${ROW.y}); CSS left ${css(ROW.x)} top ${css(ROW.y)} size ${css(ROW.w)} x ${css(ROW.h)}; max error back on the header ${check(lamps, ROW, headerBg)}/255`);
console.log(`diwali-lamp-small.png  ${small.width} x ${small.height} device px from (${SMALL.x}, ${SMALL.y}); in the tile at ${css(SMALL.x - TILE.x)}, ${css(SMALL.y - TILE.y)} CSS, size ${css(SMALL.w)} x ${css(SMALL.h)}; tile ${hex(tileBg)}; max error back on the tile ${check(small, SMALL, flat)}/255`);

// ---- close-up sheets: original | cut-out on a checkerboard | cut-out on white | cut-out back on the background ----
function sheetOf(png: PNG, rect: { x: number; y: number }, bgAt: (y: number) => RGB, k: number, file: string) {
  const w = png.width, h = png.height, gap = 6;
  const o = new PNG({ width: (w * k + gap) * 4, height: h * k });
  o.data.fill(255);
  for (let p = 0; p < 4; p++) for (let y = 0; y < h * k; y++) for (let x = 0; x < w * k; x++) {
    const sx = (x / k) | 0, sy = (y / k) | 0, s = (sy * w + sx) * 4, a = png.data[s + 3]! / 255;
    const under: RGB = p === 1 ? ((((x / 12) | 0) + ((y / 12) | 0)) % 2 ? [204, 204, 204] : [255, 255, 255]) : p === 2 ? [255, 255, 255] : bgAt(rect.y + sy);
    const c: RGB = p === 0 ? px(shot, rect.x + sx, rect.y + sy) : [0, 1, 2].map((q) => Math.round(a * png.data[s + q]! + (1 - a) * under[q]!)) as RGB;
    const t = (y * o.width + p * (w * k + gap) + x) * 4;
    o.data[t] = c[0]; o.data[t + 1] = c[1]; o.data[t + 2] = c[2]; o.data[t + 3] = 255;
  }
  fs.writeFileSync(path.join(OUT, file), PNG.sync.write(o));
  console.log('  sheet:', path.join(OUT, file));
}
sheetOf(cropPng(lamps, 0, 0, 180, 110), { x: ROW.x, y: ROW.y }, headerBg, 4, 'diwali-lamp1-sheet.png');
sheetOf(lamps, ROW, headerBg, 1, 'diwali-lamps-sheet.png');
sheetOf(small, SMALL, flat, 8, 'diwali-small-sheet.png');

function cropPng(src: PNG, x: number, y: number, w: number, h: number): PNG {
  const o = new PNG({ width: w, height: h });
  for (let j = 0; j < h; j++) src.data.copy(o.data, j * w * 4, ((y + j) * src.width + x) * 4, ((y + j) * src.width + x + w) * 4);
  return o;
}
