// Compare every screenshot icon against Lucide, Phosphor and Heroicons with the same fitting procedure:
//  - stroke libraries (Lucide, Heroicons): size fitted to the ink box, stroke interpolated so ink mass matches
//  - Phosphor (fixed-geometry weights): size fitted per weight, every weight scored
//  - filled active-tab icons: outline icon filled via CSS (fill: currentColor) AND the library's solid/fill variant
// One combined sheet: screenshot | best Lucide | best Phosphor | best Heroicons | diff of the overall best.
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Lucide from 'lucide-react';
import * as Phosphor from '@phosphor-icons/react';
import * as HeroO from '@heroicons/react/24/outline';
import * as HeroS from '@heroicons/react/24/solid';
import { PNG } from 'pngjs';
import { loadPng, crop, modeColor, inkColor, inkBBox, alignedDiff, newPage, closeBrowser, shotEl, sheet, dist, px, OUT, type RGB } from './lib.ts';
import { ICONS, type IconSpec } from './icon-specs.ts';

type Lib = 'lucide' | 'phosphor' | 'heroicons';
// Candidate names per library. Heroicons: "S:" = 24/solid. Missing entries = the library has no such icon.
const PH: Record<string, string[]> = {
  'welcome-bed': ['Bed'], 'welcome-utensils': ['ForkKnife'], 'welcome-wallet': ['Wallet'], 'welcome-chat': ['ChatCircleDots', 'ChatTeardropDots'],
  'signin-back': ['CaretLeft'], 'signin-eye': ['Eye'], 'home-chip-calendar': ['CalendarDots', 'CalendarBlank'], 'home-chip-wrench': ['Wrench'],
  'home-chip-utensils': ['ForkKnife'], 'home-app-calendar': ['CalendarDots', 'CalendarBlank'], 'home-app-wrench': ['Wrench'],
  'home-app-megaphone': ['Megaphone', 'MegaphoneSimple'], 'home-app-utensils': ['ForkKnife'],
  'tab-home-active': ['House', 'HouseSimple', 'HouseLine'], 'tab-home': ['House', 'HouseSimple', 'HouseLine'], 'tab-bell': ['Bell', 'BellSimple'],
  'tab-bell-active': ['Bell', 'BellSimple'], 'tab-support': ['Headset', 'Headphones'], 'tab-support-active': ['Headset', 'Headphones'],
  'notif-chevron': ['CaretRight'], 'help-phone': ['Phone'], 'help-arrow': ['ArrowRight'], 'help-question': ['Question'], 'help-chevron': ['CaretRight'],
  'help-video': ['VideoCamera'], 'profile-camera': ['Camera'], 'profile-bed': ['Bed'], 'profile-phone': ['Phone'], 'profile-mail': ['Envelope', 'EnvelopeSimple'],
  'profile-qr': ['QrCode'], 'profile-qr-chevron': ['CaretRight'], 'profile-user': ['User'], 'profile-key': ['Key'], 'profile-shield': ['ShieldCheck'],
  'profile-settings': ['Gear', 'GearSix'], 'profile-info': ['Info'], 'profile-chevron': ['CaretRight'], 'profile-logout': ['SignOut'], 'qr-close': ['X'],
  'settings-back': ['CaretLeft'], 'settings-accessibility': ['PersonArmsSpread', 'Person'], 'settings-gauge': ['Gauge', 'Speedometer'], 'settings-trash': ['Trash', 'TrashSimple'],
};
const HE: Record<string, string[]> = {
  'welcome-wallet': ['WalletIcon'], 'welcome-chat': ['ChatBubbleOvalLeftEllipsisIcon'], 'signin-back': ['ChevronLeftIcon'], 'signin-eye': ['EyeIcon'],
  'home-chip-calendar': ['CalendarDaysIcon'], 'home-chip-wrench': ['WrenchIcon'], 'home-app-calendar': ['CalendarDaysIcon'], 'home-app-wrench': ['WrenchIcon'],
  'home-app-megaphone': ['MegaphoneIcon'], 'tab-home-active': ['HomeIcon', 'S:HomeIcon'], 'tab-home': ['HomeIcon'], 'tab-bell': ['BellIcon'],
  'tab-bell-active': ['BellIcon', 'S:BellIcon'], 'notif-chevron': ['ChevronRightIcon'], 'help-phone': ['PhoneIcon', 'S:PhoneIcon'], 'help-arrow': ['ArrowRightIcon'],
  'help-question': ['QuestionMarkCircleIcon'], 'help-chevron': ['ChevronRightIcon'], 'help-video': ['VideoCameraIcon'], 'profile-camera': ['CameraIcon', 'S:CameraIcon'],
  'profile-phone': ['PhoneIcon'], 'profile-mail': ['EnvelopeIcon'], 'profile-qr': ['QrCodeIcon'], 'profile-qr-chevron': ['ChevronRightIcon'], 'profile-user': ['UserIcon'],
  'profile-key': ['KeyIcon'], 'profile-shield': ['ShieldCheckIcon'], 'profile-settings': ['Cog6ToothIcon', 'Cog8ToothIcon', 'CogIcon'], 'profile-info': ['InformationCircleIcon'],
  'profile-chevron': ['ChevronRightIcon'], 'profile-logout': ['ArrowRightStartOnRectangleIcon', 'ArrowRightOnRectangleIcon'], 'qr-close': ['XMarkIcon'],
  'settings-back': ['ChevronLeftIcon'], 'settings-trash': ['TrashIcon'],
};
const cands = (s: IconSpec, lib: Lib) => (lib === 'lucide' ? s.cands : lib === 'phosphor' ? PH[s.id] ?? [] : HE[s.id] ?? []);

const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
function refCrop(s: IconSpec) {
  const img = crop(loadPng(s.file), { x: s.box[0], y: s.box[1], w: s.box[2], h: s.box[3] });
  const bg = modeColor(img);
  if (s.mask) for (let y = s.mask.y; y < s.mask.y + s.mask.h; y++) for (let x = s.mask.x; x < s.mask.x + s.mask.w; x++) { const o = (y * img.width + x) * 4; img.data[o] = bg[0]; img.data[o + 1] = bg[1]; img.data[o + 2] = bg[2]; }
  return { img, bg, fg: inkColor(img, bg) };
}

const page = await newPage(400, 400);
await page.setContent(`<html><body style="margin:0"><div id="t" style="position:absolute;left:20px;top:20px;padding:6px;line-height:0"></div></body></html>`);
// variant: stroke width (number) for stroke libs; Phosphor weight (string)
function svgFor(lib: Lib, name: string, size: number, variant: number | string, fg: RGB, cssFill: boolean) {
  const color = `rgb(${fg})`;
  if (lib === 'lucide') { const C = (Lucide as any)[name]; return renderToStaticMarkup(createElement(C, { size, strokeWidth: variant, color, fill: cssFill ? color : 'none' })); }
  if (lib === 'phosphor') { const C = (Phosphor as any)[name + 'Icon'] ?? (Phosphor as any)[name]; return renderToStaticMarkup(createElement(C, { size, weight: variant, color })); }
  const solid = name.startsWith('S:'); const C = solid ? (HeroS as any)[name.slice(2)] : (HeroO as any)[name];
  const props: any = { width: size, height: size, style: { color } };
  if (!solid) { props.strokeWidth = variant; if (cssFill) props.fill = color; }
  return renderToStaticMarkup(createElement(C, props));
}
async function render(lib: Lib, name: string, size: number, variant: number | string, fg: RGB, bg: RGB, cssFill: boolean, sub = 0) {
  await page.evaluate(({ svg, bg, sub }) => { document.body.style.background = `rgb(${bg})`; const t = document.getElementById('t')!; t.style.background = `rgb(${bg})`; t.style.left = `${20 + sub}px`; t.style.top = `${20 + sub}px`; t.innerHTML = svg; }, { svg: svgFor(lib, name, size, variant, fg, cssFill), bg, sub });
  return shotEl(page, '#t');
}
const mass = (p: PNG, fg: RGB, bg: RGB) => { const f = dist(fg, bg); let m = 0; for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) m += Math.min(1, dist(px(p, x, y), bg) / f); return m; };

type Fit = { lib: Lib; icon: string; variant: string; size: number; pctInk: number; d: ReturnType<typeof alignedDiff> };
async function fitOne(s: IconSpec, lib: Lib, name: string, ref: PNG, fg: RGB, bg: RGB): Promise<Fit | null> {
  const rb = inkBBox(ref, bg)!;
  const solid = name.startsWith('S:');
  const cssFill = !!s.fill && !solid && lib !== 'phosphor';
  const fitSize = async (v: number | string) => {
    let size = 24;
    for (let i = 0; i < 3; i++) { const c = await render(lib, name, size, v, fg, bg, cssFill); const cb = inkBBox(c, bg); if (!cb) return null; size *= s.mask ? rb.h / cb.h : Math.max(rb.w, rb.h) / Math.max(cb.w, cb.h); }
    return size;
  };
  const score = async (v: number | string) => {
    const size = await fitSize(v); if (!size) return null;
    let best: ReturnType<typeof alignedDiff> | null = null;
    for (const sub of [0, 1 / 6]) { const c = await render(lib, name, size, v, fg, bg, cssFill, sub); const d = alignedDiff(ref, c, bg, { range: 3 }); if (!best || d.mismatch < best.mismatch) best = d; }
    return { size, d: best! };
  };
  const label = (v: number | string) => (lib === 'phosphor' ? `weight ${v}` : solid ? 'solid' : cssFill ? `outline + CSS fill, stroke ${v}` : `stroke ${v}`);
  if (lib === 'phosphor') {
    let best: Fit | null = null;
    for (const w of s.fill ? ['fill'] : ['thin', 'light', 'regular', 'bold']) { const r = await score(w); if (r && (!best || r.d.pctInk < best.pctInk)) best = { lib, icon: name, variant: label(w), size: +r.size.toFixed(2), pctInk: +r.d.pctInk.toFixed(1), d: r.d }; }
    return best;
  }
  let sw = 2;
  if (!s.fill && !solid) {
    const curve: { sw: number; r: number }[] = [];
    for (const w of [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5]) { const sz = await fitSize(w); if (!sz) continue; const c = await render(lib, name, sz, w, fg, bg, false); curve.push({ sw: w, r: mass(c, fg, bg) / mass(ref, fg, bg) }); }
    sw = curve[0].sw; for (let i = 0; i < curve.length - 1; i++) if ((curve[i].r - 1) * (curve[i + 1].r - 1) <= 0) { const a = curve[i], b = curve[i + 1]; sw = a.sw + ((1 - a.r) / (b.r - a.r)) * (b.sw - a.sw); break; }
    if (curve.every((c) => c.r < 1)) sw = 2.5; sw = Math.round(sw * 4) / 4;
  }
  const r = await score(sw); if (!r) return null;
  return { lib, icon: name, variant: label(sw), size: +r.size.toFixed(2), pctInk: +r.d.pctInk.toFixed(1), d: r.d };
}

const LIBS: Lib[] = ['lucide', 'phosphor', 'heroicons'];
const rows: Parameters<typeof sheet>[2] = []; const out: any[] = [];
const wins: Record<Lib, number> = { lucide: 0, phosphor: 0, heroicons: 0 };
for (const s of ICONS.filter((x) => !ONLY || ONLY.has(x.id))) {
  const { img: ref, bg, fg } = refCrop(s);
  const bestPer: Partial<Record<Lib, Fit>> = {};
  for (const lib of LIBS) for (const name of cands(s, lib)) { const f = await fitOne(s, lib, name, ref, fg, bg); if (f && (!bestPer[lib] || f.pctInk < bestPer[lib]!.pctInk)) bestPer[lib] = f; }
  const overall = Object.values(bestPer).sort((a, b) => a!.pctInk - b!.pctInk)[0]!;
  wins[overall.lib]++;
  const line = LIBS.map((l) => (bestPer[l] ? `${l} ${bestPer[l]!.icon} ${bestPer[l]!.pctInk}% (${bestPer[l]!.variant}, ${bestPer[l]!.size}px)` : `${l} —`)).join('  |  ');
  console.log(`${s.id.padEnd(24)} ${line}`);
  out.push({ id: s.id, best: { lib: overall.lib, icon: overall.icon, pctInk: overall.pctInk }, ...Object.fromEntries(LIBS.map((l) => [l, bestPer[l] ? { icon: bestPer[l]!.icon, variant: bestPer[l]!.variant, size: bestPer[l]!.size, pctInk: bestPer[l]!.pctInk } : null])) });
  const blank = new PNG({ width: ref.width, height: ref.height }); blank.data.fill(255);
  rows.push({ label: s.id, note: LIBS.map((l) => `${l}: ${bestPer[l] ? `${bestPer[l]!.icon} ${bestPer[l]!.pctInk}%` : 'none'}`).join('\n') + `\nbest: ${overall.lib}`,
    imgs: [{ cap: 'screenshot', png: overall.d.ref }, ...LIBS.map((l) => ({ cap: bestPer[l] ? `${l}: ${bestPer[l]!.icon}` : `${l}: none`, png: bestPer[l]?.d.cand ?? blank })), { cap: `diff (${overall.lib})`, png: overall.d.diff }] });
}
fs.writeFileSync(path.join(OUT, 'icons-multi.json'), JSON.stringify(out, null, 2));
console.log('\nbest library per icon:', JSON.stringify(wins));
console.log(await sheet('icon-comparison-multi.png', 'Icons: screenshot vs Lucide / Phosphor / Heroicons (fitted size & stroke/weight) — % = mismatched ink pixels', rows, 1));
await closeBrowser();
