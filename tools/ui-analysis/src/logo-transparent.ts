// Make the supplied Space Basic logo transparent WITHOUT recolouring it:
//  - only the white background connected to the image border is removed (flood fill)
//  - pixels on the boundary of the mark get alpha by "unblending" from white (GIMP colour-to-alpha),
//    so they composite back to exactly the original pixel on white
//  - every interior pixel of the mark keeps its exact original RGB and alpha 255
// Then crop to the mark's bounding box.
import path from 'node:path';
import fs from 'node:fs';
import { PNG } from 'pngjs';
import { loadPng, crop, inkBBox, REF, dist, px, type RGB } from './lib.ts';

const src = loadPng(path.join(REF, 'assets/logo-spacebasic.png'));
const W = src.width, H = src.height, WHITE: RGB = [255, 255, 255];
const NEAR_WHITE = 8;       // background: within 8 of pure white
const bgMask = new Uint8Array(W * H);
const stack: number[] = [];
for (let x = 0; x < W; x++) { stack.push(x, (H - 1) * W + x); }
for (let y = 0; y < H; y++) { stack.push(y * W, y * W + W - 1); }
while (stack.length) {
  const i = stack.pop()!; if (bgMask[i]) continue;
  const x = i % W, y = (i / W) | 0;
  if (dist(px(src, x, y), WHITE) > NEAR_WHITE) continue;
  bgMask[i] = 1;
  if (x > 0) stack.push(i - 1); if (x < W - 1) stack.push(i + 1); if (y > 0) stack.push(i - W); if (y < H - 1) stack.push(i + W);
}
// boundary band: non-background pixels within 3 px of background
const out = new PNG({ width: W, height: H });
let edge = 0, kept = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
  const i = y * W + x, o = i * 4;
  const c = px(src, x, y);
  if (bgMask[i]) { out.data[o + 3] = 0; continue; }
  let nearBg = false;
  for (let dy = -3; dy <= 3 && !nearBg; dy++) for (let dx = -3; dx <= 3; dx++) { const xx = x + dx, yy = y + dy; if (xx >= 0 && yy >= 0 && xx < W && yy < H && bgMask[yy * W + xx]) { nearBg = true; break; } }
  if (!nearBg) { out.data[o] = c[0]; out.data[o + 1] = c[1]; out.data[o + 2] = c[2]; out.data[o + 3] = 255; kept++; continue; }
  // colour-to-alpha against white
  const a = Math.max(...c.map((v) => (255 - v) / 255));
  if (a <= 0) { out.data[o + 3] = 0; continue; }
  for (let k = 0; k < 3; k++) out.data[o + k] = Math.round(Math.min(255, Math.max(0, (c[k] - 255 * (1 - a)) / a)));
  out.data[o + 3] = Math.round(a * 255); edge++;
}
// verify: composite back on white == original (within rounding)
let maxErr = 0;
for (let i = 0; i < W * H; i++) { const a = out.data[i * 4 + 3] / 255; for (let k = 0; k < 3; k++) { const comp = out.data[i * 4 + k] * a + 255 * (1 - a); maxErr = Math.max(maxErr, Math.abs(comp - src.data[i * 4 + k])); } }
const b = inkBBox(src, WHITE, 40)!;
// crop to the alpha bounding box (include soft edge)
let x0 = W, y0 = H, x1 = 0, y1 = 0;
for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (out.data[(y * W + x) * 4 + 3] > 0) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
const cropped = crop(out, { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 });
const dest = path.join(REF, 'assets/logo-spacebasic-transparent.png');
fs.writeFileSync(dest, PNG.sync.write(cropped));
console.log(`interior pixels kept byte-identical: ${kept}; edge pixels unblended: ${edge}; max composite-on-white error: ${maxErr.toFixed(2)}/255`);
console.log(`ink box (t=40) ${b.w}x${b.h}; transparent crop ${cropped.width}x${cropped.height} -> ${dest}`);
