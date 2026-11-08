// Edge probe for reference screenshots (no browser). Prints solid colour runs along a row or column with
// SUB-PIXEL boundaries: an anti-aliased pixel between colours A and B is split by projecting it onto A→B.
// Used to measure box edges, radii and colours for docs/ui-measurements.md.
//
//   node src/probe.ts <file.png> col <x> [y0 y1] [--top=78]   runs down column x
//   node src/probe.ts <file.png> row <y> [x0 x1] [--top=78]   runs along row y
//   node src/probe.ts <file.png> lines <x y w h> [#bg]        ink row bands + ink x-extent per band
//   node src/probe.ts <file.png> at <x> <y>                   one pixel
//   node src/probe.ts <file.png> ink <x y w h>                 text/stroke colour: most frequent fully-covered colour
// Input coordinates are screenshot device px. Output is CSS px (device / 3); y values are relative to the app
// viewport top (`--top`, default 78 = below the Android status bar), x values to the screen's left edge.
import { loadPng, px, hex, dist, rowBands, inkBBox, crop, type RGB } from './lib.ts';

const argv = process.argv.slice(2);
const top = Number(argv.find((a) => a.startsWith('--top='))?.slice(6) ?? 78);
const [file, mode, ...rest] = argv.filter((a) => !a.startsWith('--'));
if (!file || !mode) { console.error('usage: see header'); process.exit(2); }
const png = loadPng(file);
const n = rest.map(Number);
const f2 = (v: number) => v.toFixed(2).padStart(7);

/** Solid runs (>= minRun px within tol) and the sub-pixel boundary between consecutive runs. */
function runs(points: [number, number][], offset: number, minRun = 2, tol = 6) {
  const cols = points.map((p) => px(png, p[0], p[1]));
  const solid: { s: number; e: number; c: RGB }[] = [];
  let s = 0;
  for (let i = 1; i <= cols.length; i++) {
    if (i === cols.length || dist(cols[i]!, cols[s]!) > tol) {
      if (i - s >= minRun) solid.push({ s, e: i, c: cols[s]! });
      s = i;
    }
  }
  const lines: string[] = [];
  for (let k = 0; k < solid.length; k++) {
    const r = solid[k]!; const nx = solid[k + 1];
    let start = r.s;
    if (k > 0) {
      const pr = solid[k - 1]!;
      // AA pixels between pr.e and r.s: sum of coverage of r's colour
      let cov = 0; const a = pr.c, b = r.c; const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]]; const L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2 || 1;
      for (let i = pr.e; i < r.s; i++) {
        const c = cols[i]!; const t = ((c[0] - a[0]) * ab[0] + (c[1] - a[1]) * ab[1] + (c[2] - a[2]) * ab[2]) / L;
        cov += Math.min(1, Math.max(0, t));
      }
      start = r.s - cov;
    }
    void nx;
    lines.push(`${f2((start - offset) / 3)}  ${hex(r.c)}  (solid ${((r.e - r.s) / 3).toFixed(2)})`);
  }
  console.log(lines.join('\n'));
}

if (mode === 'col') {
  const [x, y0 = 0, y1 = png.height - 1] = n;
  runs(Array.from({ length: y1! - y0! + 1 }, (_, i) => [x!, y0! + i] as [number, number]), top - y0!);
} else if (mode === 'row') {
  const [y, x0 = 0, x1 = png.width - 1] = n;
  runs(Array.from({ length: x1! - x0! + 1 }, (_, i) => [x0! + i, y!] as [number, number]), -x0!);
} else if (mode === 'at') {
  console.log(hex(px(png, n[0]!, n[1]!)));
} else if (mode === 'ink') {
  // Fully covered stroke pixels are the ones farthest from the background; take the most frequent colour among
  // the top band (within 12% of the farthest), so anti-aliased edge pixels don't skew the result.
  const [x, y, w, h] = n as [number, number, number, number];
  const bg = px(png, x, y); const pts: RGB[] = [];
  for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) pts.push(px(png, i, j));
  let far = 0; for (const c of pts) far = Math.max(far, dist(c, bg));
  const hist = new Map<string, number>();
  for (const c of pts) if (dist(c, bg) >= far * 0.88) hist.set(hex(c), (hist.get(hex(c)) ?? 0) + 1);
  const top3 = [...hist].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => `${k}×${v}`).join(' ');
  console.log(`bg ${hex(bg)}  ink ${top3}`);
} else if (mode === 'lines') {
  const [x, y, w, h] = n as [number, number, number, number];
  const bgHex = rest[4];
  const bg: RGB = bgHex ? [parseInt(bgHex.slice(1, 3), 16), parseInt(bgHex.slice(3, 5), 16), parseInt(bgHex.slice(5, 7), 16)] : px(png, x, y);
  for (const [a, b] of rowBands(png, { x, y, w, h }, bg)) {
    const box = inkBBox(crop(png, { x, y: a, w, h: b - a + 1 }), bg)!;
    console.log(`ink y ${f2((a - top) / 3)} – ${f2((b + 1 - top) / 3)} (h ${((b + 1 - a) / 3).toFixed(2)})   x ${f2((x + box.x) / 3)} – ${f2((x + box.x + box.w) / 3)} (w ${(box.w / 3).toFixed(2)})`);
  }
}
