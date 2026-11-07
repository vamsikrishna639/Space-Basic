// Compare every icon in the screenshots with Lucide candidates at fitted size + stroke width.
import fs from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as Lucide from 'lucide-react';
import * as Tabler from '@tabler/icons-react';
import { PNG } from 'pngjs';
import { loadPng, crop, modeColor, inkColor, inkBBox, alignedDiff, newPage, closeBrowser, shotEl, sheet, hex, dist, px, OUT, DPR, type RGB, type Rect } from './lib.ts';

interface IconSpec { id: string; file: string; box: [number, number, number, number]; cands: string[]; fill?: boolean; mask?: Rect; sizeFrom?: string }
export const ICONS: IconSpec[] = [
  { id: 'welcome-bed', file: '01-welcome.png', box: [95, 780, 100, 100], cands: ['BedDouble', 'Bed', 'BedSingle'] },
  { id: 'welcome-utensils', file: '01-welcome.png', box: [303, 826, 100, 100], cands: ['UtensilsCrossed'] },
  { id: 'welcome-wallet', file: '01-welcome.png', box: [512, 780, 100, 100], cands: ['Wallet', 'WalletMinimal'] },
  { id: 'welcome-chat', file: '01-welcome.png', box: [721, 826, 100, 100], cands: ['MessageCircleMore', 'MessageCircle'] },
  { id: 'signin-back', file: '02-signin-mobile.png', box: [66, 205, 60, 68], cands: ['ChevronLeft'] },
  { id: 'signin-eye', file: '03-signin-email.png', box: [900, 1250, 85, 75], cands: ['Eye'] },
  { id: 'home-chip-calendar', file: '04-home.png', box: [2, 660, 60, 66], cands: ['CalendarDays', 'CalendarRange'] },
  { id: 'home-chip-wrench', file: '04-home.png', box: [485, 660, 66, 66], cands: ['Wrench'] },
  { id: 'home-chip-utensils', file: '04-home.png', box: [940, 660, 58, 66], cands: ['Utensils'] },
  { id: 'home-app-calendar', file: '04-home.png', box: [140, 980, 105, 100], cands: ['CalendarDays', 'CalendarRange'] },
  { id: 'home-app-wrench', file: '04-home.png', box: [372, 980, 105, 100], cands: ['Wrench'] },
  { id: 'home-app-megaphone', file: '04-home.png', box: [605, 980, 105, 100], cands: ['Megaphone'] },
  { id: 'home-app-utensils', file: '04-home.png', box: [838, 980, 105, 100], cands: ['Utensils'] },
  { id: 'tab-home-active', file: '04-home.png', box: [112, 2180, 82, 80], cands: ['House'], fill: true },
  { id: 'tab-home', file: '05-notifications.png', box: [112, 2180, 82, 80], cands: ['House'] },
  { id: 'tab-bell', file: '04-home.png', box: [372, 2180, 82, 80], cands: ['Bell'], mask: { x: 44, y: 0, w: 38, h: 40 } },
  { id: 'tab-bell-active', file: '05-notifications.png', box: [372, 2180, 82, 80], cands: ['Bell'], fill: true, mask: { x: 44, y: 0, w: 38, h: 40 } },
  { id: 'tab-support', file: '04-home.png', box: [628, 2180, 82, 80], cands: ['Headphones', 'Headset'] },
  { id: 'tab-support-active', file: '06-contact-support.png', box: [628, 2180, 82, 80], cands: ['Headphones', 'Headset'], fill: true },
  { id: 'notif-chevron', file: '05-notifications.png', box: [985, 425, 50, 60], cands: ['ChevronRight'] },
  { id: 'help-phone', file: '06-contact-support.png', box: [120, 525, 78, 78], cands: ['Phone'], fill: true },
  { id: 'help-arrow', file: '06-contact-support.png', box: [925, 535, 65, 60], cands: ['ArrowRight'] },
  { id: 'help-question', file: '06-contact-support.png', box: [120, 835, 72, 72], cands: ['CircleQuestionMark', 'CircleHelp', 'BadgeQuestionMark'] },
  { id: 'help-chevron', file: '06-contact-support.png', box: [935, 843, 45, 55], cands: ['ChevronRight'] },
  { id: 'help-video', file: '06-contact-support.png', box: [225, 1053, 65, 50], cands: ['Video'] },
  { id: 'profile-camera', file: '07-profile.png', box: [258, 487, 42, 38], cands: ['Camera'], fill: true },
  { id: 'profile-bed', file: '07-profile.png', box: [380, 435, 55, 50], cands: ['BedDouble', 'Bed', 'BedSingle'] },
  { id: 'profile-phone', file: '07-profile.png', box: [358, 530, 55, 58], cands: ['Phone'] },
  { id: 'profile-mail', file: '07-profile.png', box: [358, 598, 55, 50], cands: ['Mail'] },
  { id: 'profile-qr', file: '07-profile.png', box: [152, 762, 78, 78], cands: ['QrCode'] },
  { id: 'profile-qr-chevron', file: '07-profile.png', box: [900, 775, 45, 55], cands: ['ChevronRight'] },
  { id: 'profile-user', file: '07-profile.png', box: [117, 1105, 78, 78], cands: ['User', 'UserRound'] },
  { id: 'profile-key', file: '07-profile.png', box: [117, 1290, 78, 78], cands: ['KeyRound', 'Key'] },
  { id: 'profile-shield', file: '07-profile.png', box: [117, 1475, 78, 80], cands: ['ShieldCheck'] },
  { id: 'profile-settings', file: '07-profile.png', box: [117, 1790, 78, 80], cands: ['Settings', 'Cog'] },
  { id: 'profile-info', file: '07-profile.png', box: [117, 1976, 78, 78], cands: ['Info'] },
  { id: 'profile-chevron', file: '07-profile.png', box: [935, 1118, 45, 52], cands: ['ChevronRight'] },
  { id: 'profile-logout', file: '07-profile(1).png', box: [117, 1873, 78, 78], cands: ['LogOut'] },
  { id: 'qr-close', file: 'QR_entry-pass.png', box: [955, 1015, 58, 58], cands: ['X'] },
  { id: 'settings-back', file: 'settings-dark.png', box: [50, 165, 55, 65], cands: ['ChevronLeft'] },
  { id: 'settings-accessibility', file: 'settings-light.png', box: [117, 1705, 78, 85], cands: ['PersonStanding', 'Accessibility'] },
  { id: 'settings-gauge', file: 'settings-light.png', box: [115, 1940, 82, 78], cands: ['Gauge'] },
  { id: 'settings-trash', file: 'settings-light.png', box: [120, 2172, 72, 78], cands: ['Trash2', 'Trash'] },
];

const LIB = process.env.LIB ?? "lucide";
// Tabler candidates per icon id (filled specs use the *Filled components)
const TABLER: Record<string, string[]> = {
  "welcome-bed": ["IconBed", "IconBedFlat"], "welcome-utensils": ["IconToolsKitchen", "IconToolsKitchen3"], "welcome-wallet": ["IconWallet"],
  "welcome-chat": ["IconMessageDots", "IconMessageCircle", "IconMessageCircle2"], "signin-back": ["IconChevronLeft"], "signin-eye": ["IconEye"],
  "home-chip-calendar": ["IconCalendarWeek", "IconCalendarMonth", "IconCalendarEvent", "IconCalendarDot"], "home-chip-wrench": ["IconTool"], "home-chip-utensils": ["IconToolsKitchen2", "IconToolsKitchen3"],
  "home-app-calendar": ["IconCalendarWeek", "IconCalendarMonth", "IconCalendarEvent", "IconCalendarDot"], "home-app-wrench": ["IconTool"], "home-app-megaphone": ["IconSpeakerphone"], "home-app-utensils": ["IconToolsKitchen2", "IconToolsKitchen3"],
  "tab-home-active": ["IconHomeFilled"], "tab-home": ["IconHome", "IconHome2", "IconSmartHome"], "tab-bell": ["IconBell"], "tab-bell-active": ["IconBellFilled"],
  "tab-support": ["IconHeadset", "IconHeadphones"], "tab-support-active": ["IconHeadsetFilled", "IconHeadphonesFilled"], "notif-chevron": ["IconChevronRight"],
  "help-phone": ["IconPhoneFilled"], "help-arrow": ["IconArrowRight"], "help-question": ["IconHelpCircle"], "help-chevron": ["IconChevronRight"], "help-video": ["IconVideo"],
  "profile-camera": ["IconCameraFilled"], "profile-bed": ["IconBed", "IconBedFlat"], "profile-phone": ["IconPhone"], "profile-mail": ["IconMail"], "profile-qr": ["IconQrcode"],
  "profile-qr-chevron": ["IconChevronRight"], "profile-user": ["IconUser"], "profile-key": ["IconKey"], "profile-shield": ["IconShieldCheck"], "profile-settings": ["IconSettings"],
  "profile-info": ["IconInfoCircle"], "profile-chevron": ["IconChevronRight"], "profile-logout": ["IconLogout", "IconLogout2"], "qr-close": ["IconX"], "settings-back": ["IconChevronLeft"],
  "settings-accessibility": ["IconAccessible", "IconMan", "IconStretching"], "settings-gauge": ["IconGauge", "IconDashboard", "IconBrandSpeedtest"], "settings-trash": ["IconTrash"],
};
if (LIB === "tabler") for (const s of ICONS) s.cands = TABLER[s.id];
const ONLY = process.argv[2] ? new Set(process.argv[2].split(',')) : null;
const MODE = process.env.MODE ?? 'fit'; // 'crops' = just dump the reference crops

function refCrop(s: IconSpec) {
  const img = crop(loadPng(s.file), { x: s.box[0], y: s.box[1], w: s.box[2], h: s.box[3] });
  const bg = modeColor(img);
  if (s.mask) for (let y = s.mask.y; y < s.mask.y + s.mask.h; y++) for (let x = s.mask.x; x < s.mask.x + s.mask.w; x++) { const o = (y * img.width + x) * 4; img.data[o] = bg[0]; img.data[o + 1] = bg[1]; img.data[o + 2] = bg[2]; }
  return { img, bg, fg: inkColor(img, bg) };
}

if (MODE === 'crops') {
  const rows = ICONS.filter((s) => !ONLY || ONLY.has(s.id)).map((s) => { const r = refCrop(s); const b = inkBBox(r.img, r.bg); return { label: s.id, note: `${s.file}\nbg ${hex(r.bg)} ink ${hex(r.fg)}\nink box ${b ? `${b.w}x${b.h}` : 'none'}`, imgs: [{ cap: 'crop', png: r.img }] }; });
  console.log(await sheet('icon-crops.png', 'Icon crops from reference screenshots', rows, 1));
  await closeBrowser(); process.exit(0);
}

const page = await newPage(400, 400);
await page.setContent(`<html><body style="margin:0"><div id="t" style="position:absolute;left:20px;top:20px;padding:6px;line-height:0"></div></body></html>`);
const svgFor = (name: string, size: number, sw: number, fg: RGB, fill: boolean) => {
  if (LIB === "tabler") { const C = (Tabler as any)[name]; if (!C) throw new Error("No Tabler icon " + name); return renderToStaticMarkup(createElement(C, { size, stroke: sw, color: `rgb(${fg})` })); }
  const C = (Lucide as any)[name] ?? (Lucide as any)[name + 'Icon'];
  if (!C) throw new Error('No Lucide icon ' + name);
  return renderToStaticMarkup(createElement(C, { size, strokeWidth: sw, color: `rgb(${fg})`, fill: fill ? `rgb(${fg})` : 'none' }));
};
async function render(name: string, size: number, sw: number, fg: RGB, bg: RGB, fill: boolean, sub = 0) {
  await page.evaluate(({ svg, bg, sub }) => { document.body.style.background = `rgb(${bg})`; const t = document.getElementById('t')!; t.style.background = `rgb(${bg})`; t.style.left = `${20 + sub}px`; t.style.top = `${20 + sub}px`; t.innerHTML = svg; }, { svg: svgFor(name, size, sw, fg, fill), bg, sub });
  return shotEl(page, '#t');
}
const mass = (p: PNG, fg: RGB, bg: RGB) => { const f = dist(fg, bg); let m = 0; for (let y = 0; y < p.height; y++) for (let x = 0; x < p.width; x++) m += Math.min(1, dist(px(p, x, y), bg) / f); return m; };

type Res = { id: string; icon: string; size: number; stroke: number; pctInk: number; pctArea: number; refBox: string; candBox: string };
const all: Res[] = []; const rows: Parameters<typeof sheet>[2] = [];
const fitted: Record<string, number> = {};
for (const s of ICONS.filter((x) => !ONLY || ONLY.has(x.id))) {
  const { img: ref, bg, fg } = refCrop(s);
  const rb = inkBBox(ref, bg)!;
  const perCand: (Res & { d: ReturnType<typeof alignedDiff> })[] = [];
  for (const name of s.cands) {
    // size: scale so the larger ink dimension matches (masked icons: use height only)
    const fitSize = async (sw: number) => {
      let size = 24;
      for (let i = 0; i < 3; i++) { const c = await render(name, size, sw, fg, bg, !!s.fill); const cb = inkBBox(c, bg)!; size *= s.mask ? rb.h / cb.h : Math.max(rb.w, rb.h) / Math.max(cb.w, cb.h); }
      return size;
    };
    // stroke: interpolate where ink mass matches (outline icons only)
    let sw = 2;
    if (!s.fill) {
      const curve: { sw: number; r: number }[] = [];
      for (const w of [1.25, 1.5, 1.75, 2, 2.25, 2.5]) { const sz = await fitSize(w); const c = await render(name, sz, w, fg, bg, false); curve.push({ sw: w, r: mass(c, fg, bg) / mass(ref, fg, bg) }); }
      sw = curve[0].sw; for (let i = 0; i < curve.length - 1; i++) if ((curve[i].r - 1) * (curve[i + 1].r - 1) <= 0) { const a = curve[i], b = curve[i + 1]; sw = a.sw + ((1 - a.r) / (b.r - a.r)) * (b.sw - a.sw); break; }
      if (curve.every((c) => c.r < 1)) sw = 2.5; sw = Math.round(sw * 4) / 4;
    }
    const size = await fitSize(sw);
    let best: ReturnType<typeof alignedDiff> | null = null; let cbBest: Rect = rb;
    for (const sub of [0, 1 / 6]) {
      const c = await render(name, size, sw, fg, bg, !!s.fill, sub);
      const d = alignedDiff(ref, c, bg, { range: 3 });
      if (!best || d.mismatch < best.mismatch) { best = d; cbBest = inkBBox(c, bg)!; }
    }
    perCand.push({ id: s.id, icon: name, size: +size.toFixed(2), stroke: sw, pctInk: +best!.pctInk.toFixed(1), pctArea: +best!.pctArea.toFixed(2), refBox: `${rb.w}x${rb.h}`, candBox: `${cbBest.w}x${cbBest.h}`, d: best! });
  }
  perCand.sort((a, b) => a.pctInk - b.pctInk);
  const b = perCand[0]; fitted[s.id] = b.size;
  all.push(...perCand.map(({ d, ...r }) => r));
  console.log(`${s.id.padEnd(24)} fg ${hex(fg)} bg ${hex(bg)}  ` + perCand.map((c) => `${c.icon} ${c.size}px sw${c.stroke} ink ${c.pctInk}% (box ${c.refBox} vs ${c.candBox})`).join('  |  '));
  rows.push({ label: s.id, note: perCand.map((c) => `${c.icon}: ${c.pctInk}%`).join('\n') + `\nsize ${b.size}px  stroke ${b.stroke}${s.fill ? ' (filled)' : ''}`,
    imgs: [{ cap: 'screenshot', png: b.d.ref }, ...perCand.map((c) => ({ cap: `${c.icon}`, png: c.d.cand })), { cap: `diff (${b.icon})`, png: b.d.diff }] });
}
fs.writeFileSync(path.join(OUT, `icons-${LIB}.json`), JSON.stringify(all, null, 2));
console.log(await sheet(`icon-comparison-${LIB}.png`, `Icons: screenshot crop vs ${LIB} (fitted size & stroke) — % = mismatched ink pixels`, rows, 1));
await closeBrowser();
