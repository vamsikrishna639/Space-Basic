import { loadPng, px, hex, crop, modeColor } from './lib.ts';
import path from 'node:path';
const ref = loadPng('01-welcome.png');
const src = loadPng('assets/logo-spacebasic.png');
// sample by relative position inside each logo's ink box (ref ink {113,278,97,85}; src ink {162,238,916,850})
const R = { x: 113, y: 278, w: 97, h: 85 }, S = { x: 162, y: 238, w: 916, h: 850 };
const spots: [string, number, number][] = [['top-left (dark blue)', 0.15, 0.2], ['top-right (cyan)', 0.8, 0.2], ['middle (yellow)', 0.5, 0.5], ['bottom-left (pink)', 0.15, 0.8], ['bottom-right (dark red)', 0.8, 0.8]];
for (const [n, fx, fy] of spots) {
  const avg = (img: any, b: any) => { let s = [0, 0, 0], k = 0; const cx = Math.round(b.x + fx * b.w), cy = Math.round(b.y + fy * b.h), rr = Math.max(1, Math.round(b.w * 0.03)); for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++) { const c = px(img, x, y); s[0] += c[0]; s[1] += c[1]; s[2] += c[2]; k++; } return s.map((v) => Math.round(v / k)) as [number, number, number]; };
  console.log(n.padEnd(26), 'screenshot', hex(avg(ref, R)), '  file', hex(avg(src, S)));
}
