// App icons for the web app manifest (Android install, Trusted Web Activity). WRITES ASSET FILES into
// client/public/icons/: only rerun on purpose.
//
//   node tools/ui-analysis/run-in-docker.mjs src/app-icons.ts
//
// The supplied logo is used as-is (CLAUDE.md "Logos"): never recoloured, never stretched, only scaled evenly.
//  - icon-192 / icon-512 ("any"): the supplied square logo-spacebasic.png (1254 x 1254, the mark on white),
//    scaled down whole.
//  - maskable-192 / maskable-512: the supplied transparent mark (logo-spacebasic-transparent.png) centred on the
//    same white as the square file, scaled so every ink pixel lies inside the maskable safe zone (a circle of
//    radius 40% of the icon; 39% used, for a margin), so no launcher mask (circle, squircle, teardrop) cuts it.
// Scaling runs in Chromium's canvas with imageSmoothingQuality "high". Writes a contact sheet with every icon
// under the circle and squircle masks to out/linux/app-icons-sheet.png.
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import { REF } from './lib.ts';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const DEST = path.join(ROOT, 'client/public/icons');
const OUT = process.env.UI_OUT ?? path.join(import.meta.dirname, '../out/linux');
const SAFE_RADIUS = 0.39; // of the icon size; the maskable spec's safe zone is 0.40

const square = fs.readFileSync(path.join(REF, 'assets/logo-spacebasic.png'));
const markFile = fs.readFileSync(path.join(REF, 'assets/logo-spacebasic-transparent.png'));
const mark = PNG.sync.read(markFile);

// The mark's ink box and the farthest ink pixel from its centre, in source pixels.
let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
for (let y = 0; y < mark.height; y++) for (let x = 0; x < mark.width; x++) {
  if (mark.data[(y * mark.width + x) * 4 + 3]! > 8) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
}
const cx = (x0 + x1 + 1) / 2, cy = (y0 + y1 + 1) / 2;
let far = 0;
for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
  if (mark.data[(y * mark.width + x) * 4 + 3]! > 8) far = Math.max(far, Math.hypot(x + 0.5 - cx, y + 0.5 - cy));
}
console.log(`mark ${mark.width}x${mark.height}, ink box ${x0},${y0}-${x1},${y1}, farthest ink ${far.toFixed(1)} px from its centre`);

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  await page.setContent('<!doctype html><body></body>');
  const draw = (args: { kind: 'any' | 'maskable'; size: number }) => page.evaluate(
    async ({ kind, size, squareUrl, markUrl, cx, cy, far, safe }) => {
      const load = (src: string) => new Promise<HTMLImageElement>((ok, bad) => { const i = new Image(); i.onload = () => ok(i); i.onerror = bad; i.src = src; });
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const g = c.getContext('2d')!; g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high';
      if (kind === 'any') {
        g.drawImage(await load(squareUrl), 0, 0, size, size);
      } else {
        const img = await load(markUrl);
        const k = (safe * size) / far; // same factor on both axes: never stretched
        g.fillStyle = '#ffffff'; g.fillRect(0, 0, size, size);
        g.drawImage(img, size / 2 - cx * k, size / 2 - cy * k, img.width * k, img.height * k);
      }
      return c.toDataURL('image/png');
    },
    { ...args, squareUrl: `data:image/png;base64,${square.toString('base64')}`, markUrl: `data:image/png;base64,${markFile.toString('base64')}`, cx, cy, far, safe: SAFE_RADIUS },
  );

  fs.mkdirSync(DEST, { recursive: true });
  const files: string[] = [];
  for (const kind of ['any', 'maskable'] as const) for (const size of [192, 512]) {
    const name = `${kind === 'any' ? 'icon' : 'maskable'}-${size}.png`;
    const url = await draw({ kind, size });
    fs.writeFileSync(path.join(DEST, name), Buffer.from(url.split(',')[1]!, 'base64'));
    files.push(name);
    console.log(`wrote client/public/icons/${name}`);
  }

  // Contact sheet: each icon plain, under a circle mask, and under a squircle-ish mask (radius 30%).
  const cells = files.map((f) => `data:image/png;base64,${fs.readFileSync(path.join(DEST, f)).toString('base64')}`);
  await page.setViewportSize({ width: 900, height: 620 });
  await page.setContent(`<!doctype html><style>
    body{margin:16px;font:13px sans-serif;background:#888;color:#fff} .row{display:flex;gap:16px;align-items:center;margin-bottom:12px}
    .row span{width:110px} img{width:160px;height:160px;display:block} .c{border-radius:50%} .s{border-radius:30%}
    .safe{position:relative} .safe::after{content:'';position:absolute;inset:10%;border:1px dashed red;border-radius:50%}
  </style>${files.map((f, i) => `<div class="row"><span>${f}</span><img src="${cells[i]}"><img class="c" src="${cells[i]}"><img class="s" src="${cells[i]}"><div class="safe"><img src="${cells[i]}"></div></div>`).join('')}`);
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, 'app-icons-sheet.png'), fullPage: true });
  console.log('sheet: tools/ui-analysis/out/linux/app-icons-sheet.png');
} finally {
  await browser.close();
}
