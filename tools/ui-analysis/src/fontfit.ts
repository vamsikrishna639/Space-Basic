// Fit candidate fonts to text crops from the reference screenshots and pixel-diff them.
//  - size: from ink width (or from cap height for ALL-CAPS samples, whose width also depends on tracking)
//  - weight: interpolated so the rendered ink MASS equals the reference (robust to sub-pixel shifts)
//  - score: pixelmatch (AA detection on) after ink-box alignment + sub-pixel offset search
import fs from 'node:fs';
import path from 'node:path';
import { loadPng, crop, modeColor, inkColor, inkBBox, alignedDiff, newPage, closeBrowser, allFontCss, shotEl, sheet, hex, dist, px, OUT, DPR, FONTS, type RGB } from './lib.ts';
import type { PNG } from 'pngjs';

// The Settings screenshot's device ID is personal sample data (SPEC.md), so it is never committed. The exact text
// is needed to fit glyphs to the crop; it lives in the gitignored private/screenshot-text.json ({ "deviceId": "...",
// "profileName", "profilePhone", "profileEmail" }, the My Profile screenshot's name, phone and email). Samples whose
// private text is missing are skipped.
const PRIVATE_FILE = path.resolve(import.meta.dirname, '../private/screenshot-text.json');
const PRIVATE: { deviceId: string; profileName?: string; profilePhone?: string; profileEmail?: string } =
  fs.existsSync(PRIVATE_FILE) ? JSON.parse(fs.readFileSync(PRIVATE_FILE, 'utf8')) : { deviceId: '' };

interface Sample { id: string; file: string; text: string; r: [number, number, number, number]; caps?: boolean; tnum?: boolean }
export const SAMPLES: Sample[] = [
  { id: 'w-headline-1', file: '01-welcome.png', text: 'Seamless campus', r: [50, 1172, 760, 98] },
  { id: 'w-headline-2', file: '01-welcome.png', text: 'living.', r: [50, 1276, 245, 100] },
  { id: 'w-sub-1', file: '01-welcome.png', text: 'Hostel, mess, fees and', r: [50, 1412, 560, 58] },
  { id: 'w-sub-2', file: '01-welcome.png', text: 'requests — in one app.', r: [50, 1488, 560, 60] },
  { id: 'w-btn-email', file: '01-welcome.png', text: 'Continue with email', r: [310, 1715, 460, 75] },
  { id: 's-title', file: 'settings-dark.png', text: 'Settings', r: [150, 168, 300, 80] },
  { id: 's-section', file: 'settings-dark.png', text: 'ABOUT THIS APP', r: [90, 352, 320, 38], caps: true },
  { id: 's-label-appver', file: 'settings-dark.png', text: 'App version', r: [90, 460, 260, 54] },
  { id: 's-value-appver', file: 'settings-dark.png', text: '11.1.1', r: [880, 460, 110, 54] },
  { id: 's-label-lastupd', file: 'settings-dark.png', text: 'Last updated', r: [90, 788, 290, 54] },
  { id: 's-value-lastupd', file: 'settings-dark.png', text: '3 Nov 2026, 1:52 PM', r: [570, 788, 420, 54] },
  { id: 's-label-os', file: 'settings-dark.png', text: 'Operating system', r: [90, 924, 380, 56] },
  { id: 's-value-os', file: 'settings-dark.png', text: 'Android', r: [800, 924, 190, 56] },
  { id: 's-value-devid', file: 'settings-dark.png', text: PRIVATE.deviceId, r: [590, 1464, 400, 46] },
  { id: 's-appearance', file: 'settings-dark.png', text: 'Appearance', r: [90, 1664, 265, 54] },
  { id: 's-appearance-sub', file: 'settings-dark.png', text: "System matches your phone's light or dark setting", r: [90, 1724, 860, 50] },
  { id: 's-seg-system', file: 'settings-dark.png', text: 'System', r: [170, 1850, 175, 58] },
  { id: "w-headline-1:track", file: "01-welcome.png", text: "Seamless campus", r: [50, 1172, 760, 98], caps: true },
  { id: "w-headline-2:track", file: "01-welcome.png", text: "living.", r: [50, 1276, 245, 100], caps: true },
  { id: "s-value-devid:tnum", file: "settings-dark.png", text: PRIVATE.deviceId, r: [590, 1464, 400, 46], tnum: true },
  { id: "s-value-devid:track", file: "settings-dark.png", text: PRIVATE.deviceId, r: [590, 1464, 400, 46], caps: true },
  { id: "s-value-devid:tnum+track", file: "settings-dark.png", text: PRIVATE.deviceId, r: [590, 1464, 400, 46], caps: true, tnum: true },
  { id: "s-value-appver:tnum", file: "settings-dark.png", text: "11.1.1", r: [880, 460, 110, 54], tnum: true },
  { id: "s-value-bundle", file: "settings-dark.png", text: "11.1.1-20261103-082255-", r: [465, 596, 525, 46] },
  { id: "s-value-bundle:tnum", file: "settings-dark.png", text: "11.1.1-20261103-082255-", r: [465, 596, 525, 46], tnum: true },
  // Auth screens (frontend step 6). Crop boxes come from `probe.ts lines` (docs/ui-measurements.md §9).
  { id: 'w-btn-mobile', file: '01-welcome.png', text: 'Continue with mobile', r: [300, 1900, 480, 62] },
  { id: 'w-footer-privacy', file: '01-welcome.png', text: 'Privacy Policy', r: [245, 2125, 245, 55] },
  { id: 'w-footer-terms', file: '01-welcome.png', text: 'Terms & Conditions', r: [500, 2125, 335, 55] },
  { id: 'a-title', file: '03-signin-email.png', text: 'Sign in', r: [50, 330, 260, 100] },
  { id: 'a-sub', file: '02-signin-mobile.png', text: "We'll send a four-digit code to your phone.", r: [45, 448, 880, 60] },
  { id: 'a-seg-on', file: '02-signin-mobile.png', text: 'Mobile', r: [700, 615, 160, 55] },
  { id: 'a-seg-off', file: '02-signin-mobile.png', text: 'Email', r: [240, 615, 130, 55] },
  { id: 'a-label', file: '02-signin-mobile.png', text: 'Mobile number', r: [50, 770, 285, 45] },
  { id: 'a-ph-mobile', file: '02-signin-mobile.png', text: '98765 43210', r: [95, 868, 300, 58] },
  { id: 'a-link-wa', file: '02-signin-mobile.png', text: 'Send it on WhatsApp instead', r: [50, 1055, 530, 55] },
  { id: 'a-consent-brand', file: '02-signin-mobile.png', text: 'SpaceBasic', r: [300, 1240, 225, 50] },
  { id: 'a-consent-2', file: '02-signin-mobile.png', text: 'personal data for hostel management under', r: [185, 1296, 785, 50] },
  { id: 'a-privacy', file: '02-signin-mobile.png', text: 'Read the Privacy Policy', r: [55, 1640, 430, 55] },
  { id: 'a-btn-disabled', file: '02-signin-mobile.png', text: 'Send code', r: [410, 1985, 260, 60] },
  { id: 'a-helper', file: '02-signin-mobile.png', text: 'Tick the consent box above to continue', r: [190, 2125, 700, 48] },
  { id: 'a-label-pass', file: '03-signin-email.png', text: 'Password', r: [50, 1118, 190, 50] },
  { id: 'a-forgot', file: '03-signin-email.png', text: 'Forgot password?', r: [690, 1118, 340, 56] },
  { id: 'a-ph-email', file: '03-signin-email.png', text: 'name@college.edu', r: [95, 930, 450, 65] },
  { id: 'a-ph-pass', file: '03-signin-email.png', text: 'Enter your password', r: [95, 1258, 460, 65] },
  { id: 'a-btn-login', file: '03-signin-email.png', text: 'Log in', r: [465, 2228, 150, 64] },
  // Home (04). The greeting's name is personal data, so only "Good evening," is fitted.
  { id: 'h-inst', file: '04-home.png', text: 'PRESIDENCY UNIVERSITY', r: [150, 140, 480, 45], caps: true },
  { id: 'h-greet', file: '04-home.png', text: 'Good evening,', r: [45, 255, 500, 85] },
  { id: 'h-date', file: '04-home.png', text: 'Tuesday 3 November', r: [40, 350, 405, 58] },
  { id: 'h-section', file: '04-home.png', text: 'QUICK ACTIONS', r: [45, 555, 315, 45], caps: true },
  { id: 'h-chip', file: '04-home.png', text: 'Raise a ticket', r: [555, 660, 290, 66] },
  { id: 'h-tile', file: '04-home.png', text: 'Tickets', r: [350, 1130, 150, 50] },
  { id: 'h-tile-small', file: '04-home.png', text: 'Announceme', r: [555, 1130, 200, 36] },
  { id: 'h-tab', file: '04-home.png', text: 'Support', r: [595, 2262, 150, 46] },
  { id: 'h-tab-on', file: '04-home.png', text: 'Home', r: [95, 2262, 115, 46] },
  { id: 'n-title', file: '05-notifications.png', text: 'Notifications', r: [45, 140, 420, 75] },
  { id: 'n-date', file: '05-notifications.png', text: '25 OCT 2026', r: [40, 322, 255, 42], caps: true },
  { id: 'n-row', file: '05-notifications.png', text: 'Attendance Marked', r: [100, 425, 415, 60] },
  { id: 'n-row-long', file: '05-notifications.png', text: 'Great News: Leave Approved', r: [100, 1055, 600, 60] },
  { id: 'n-row-read', file: '05-notifications.png', text: 'New Announcement', r: [165, 740, 415, 62] },
  { id: 'n-time', file: '05-notifications.png', text: '07:24 PM', r: [100, 492, 175, 45] },
  { id: 'n-time-tnum', file: '05-notifications.png', text: '07:24 PM', r: [100, 492, 175, 45], tnum: true },
  { id: 'n-tab-on', file: '05-notifications.png', text: 'Notifications', r: [298, 2262, 225, 46] },
  { id: 'p-title', file: '06-contact-support.png', text: 'Help', r: [45, 140, 160, 80] },
  { id: 'p-sub', file: '06-contact-support.png', text: 'Answers to the questions that come up most, and', r: [40, 258, 990, 56] },
  { id: 'p-contact', file: '06-contact-support.png', text: 'Contact us', r: [255, 478, 300, 60] },
  { id: 'p-contact-sub', file: '06-contact-support.png', text: 'Reach your hostel office or', r: [255, 550, 500, 56] },
  { id: 'p-faq', file: '06-contact-support.png', text: 'Common questions', r: [245, 795, 410, 58] },
  { id: 'p-faq-sub', file: '06-contact-support.png', text: 'Leave, tickets, announcements and', r: [245, 855, 615, 50] },
  { id: 'p-video', file: '06-contact-support.png', text: 'Video tutorials are on the way.', r: [295, 1052, 560, 58] },
  { id: 'r-title', file: '07-profile.png', text: 'My Profile', r: [45, 140, 330, 80] },
  { id: 'r-name', file: '07-profile.png', text: PRIVATE.profileName ?? '', r: [358, 335, 600, 62], caps: true },
  { id: 'r-chip', file: '07-profile.png', text: 'West CS240', r: [436, 438, 225, 44] },
  { id: 'r-phone', file: '07-profile.png', text: PRIVATE.profilePhone ?? '', r: [420, 530, 235, 55] },
  { id: 'r-phone-tnum', file: '07-profile.png', text: PRIVATE.profilePhone ?? '', r: [420, 530, 235, 55], tnum: true },
  { id: 'r-email', file: '07-profile.png', text: PRIVATE.profileEmail ?? '', r: [420, 598, 560, 55] },
  { id: 'r-qr', file: '07-profile.png', text: 'Show my QR code', r: [280, 728, 380, 60] },
  { id: 'r-qr-sub', file: '07-profile.png', text: 'Attendance, amenities and', r: [280, 788, 470, 42] },
  { id: 'r-row', file: '07-profile.png', text: 'My Information', r: [245, 1115, 310, 60] },
  { id: 'r-row-2', file: '07-profile.png', text: 'Change Password', r: [245, 1300, 380, 60] },
  { id: 'r-section', file: '07-profile.png', text: 'ACCOUNT', r: [45, 982, 210, 40], caps: true },
  { id: 'r-signout', file: '07-profile(1).png', text: 'Sign Out', r: [245, 1885, 190, 55] },
  { id: 'h-badge', file: '04-home.png', text: '99+', r: [424, 2182, 60, 34] },
];
if (!PRIVATE.deviceId) {
  console.warn(`fontfit: ${PRIVATE_FILE} not found; skipping the device-ID samples`);
  for (let i = SAMPLES.length - 1; i >= 0; i--) if (SAMPLES[i]!.id.startsWith('s-value-devid')) SAMPLES.splice(i, 1);
}
for (let i = SAMPLES.length - 1; i >= 0; i--) if (!SAMPLES[i]!.text) { console.warn(`fontfit: no private text for ${SAMPLES[i]!.id}; skipped`); SAMPLES.splice(i, 1); }
const ONLY = process.argv[2] ? new Set(process.argv[2].split(",")) : null;
const FONT_ONLY = process.env.FONT_ONLY;

const page = await newPage(1400, 400);
await page.setContent(`<html><head><style>${allFontCss()}
  html,body{margin:0} #t{position:absolute;left:20px;top:20px;white-space:nowrap;padding:12px 16px;line-height:1.4;font-kerning:normal}</style></head>
  <body><div id="t">x</div></body></html>`);
await page.evaluate(async (fams) => { await Promise.all(fams.flatMap((f) => [300, 400, 500, 600, 700, 800].map((w) => document.fonts.load(`${w} 40px "${f}"`)))); }, Object.keys(FONTS));

/** Canvas ink metrics at 100px: width (excluding trailing tracking) and height. */
async function metrics100(fam: string, w: number, ls: number, text: string) {
  return page.evaluate(({ fam, w, ls, text }) => {
    const c = document.createElement('canvas').getContext('2d')!;
    c.font = `${w} 100px "${fam}"`; (c as any).letterSpacing = `${ls * 100}px`;
    const m = c.measureText(text);
    return { w: m.actualBoundingBoxLeft + m.actualBoundingBoxRight - ls * 100, h: m.actualBoundingBoxAscent + m.actualBoundingBoxDescent };
  }, { fam, w, ls, text });
}
async function render(fam: string, w: number, ls: number, size: number, text: string, fg: RGB, bg: RGB, sub = 0) {
  await page.evaluate(({ fam, w, ls, size, text, fg, bg, sub, tnum }) => {
    document.body.style.background = `rgb(${bg})`;
    const t = document.getElementById('t')!;
    t.textContent = text;
    Object.assign(t.style, { left: `${20 + sub}px`, top: `${20 + sub}px`, fontFamily: `"${fam}"`, fontWeight: String(w), letterSpacing: `${ls}em`, fontSize: `${size}px`, color: `rgb(${fg})`, background: `rgb(${bg})`, fontVariantNumeric: tnum ? 'tabular-nums' : 'normal' });
  }, { fam, w, ls, size, text, fg, bg, sub, tnum: TNUM });
  return shotEl(page, '#t');
}
let TNUM = false;
function mass(png: PNG, fg: RGB, bg: RGB) {
  const full = dist(fg, bg); let m = 0;
  for (let y = 0; y < png.height; y++) for (let x = 0; x < png.width; x++) m += Math.min(1, dist(px(png, x, y), bg) / full);
  return m;
}

type Fit = { font: string; weight: number; ls: number; size: number; pctInk: number; pctArea: number; inkHRef: number; inkHCand: number; std: { weight: number; pctInk: number } };
const results: Record<string, Fit[]> = {};
const cmpRows: Parameters<typeof sheet>[2] = [];
const pjsRows: Parameters<typeof sheet>[2] = [];

for (const s of SAMPLES.filter((x) => !ONLY || ONLY.has(x.id))) {
  const ref = crop(loadPng(s.file), { x: s.r[0], y: s.r[1], w: s.r[2], h: s.r[3] });
  const bg = modeColor(ref), fg = inkColor(ref, bg);
  const rb = inkBBox(ref, bg)!; const refMass = mass(ref, fg, bg); TNUM = !!s.tnum;
  const fits: Fit[] = []; const imgs: Record<string, ReturnType<typeof alignedDiff>> = {};

  for (const fam of Object.keys(FONTS).filter((f) => !FONT_ONLY || f === FONT_ONLY)) {
    // geometry for a given weight: size + tracking
    const geom0 = async (w: number) => {
      if (!s.caps) { const m = await metrics100(fam, w, 0, s.text); return { size: (100 * rb.w) / DPR / m.w, ls: 0 }; }
      const m0 = await metrics100(fam, w, 0, s.text);
      const size = (100 * rb.h) / DPR / m0.h;                       // cap height pins the size
      const n = [...s.text].length - 1;
      const ls = (rb.w / DPR - (m0.w * size) / 100) / n / size;     // remaining width is tracking
      return { size, ls: Math.round(ls * 200) / 200 };
    };
    // canvas metrics ignore OpenType features (tnum) and differ slightly from DOM layout:
    // correct once from the actual rendered ink box.
    const geom = async (w: number) => {
      const g = await geom0(w);
      const c = await render(fam, w, g.ls, g.size, s.text, fg, bg); const cb = inkBBox(c, bg)!;
      if (!s.caps) return { size: (g.size * rb.w) / cb.w, ls: 0 };
      const size = (g.size * rb.h) / cb.h; const n = [...s.text].length - 1;
      const ls = g.ls + (rb.w - (cb.w * size) / g.size) / DPR / n / size;
      return { size, ls: Math.round(ls * 200) / 200 };
    };
    // 1) mass curve over weights -> interpolate weight where mass ratio == 1
    const curve: { w: number; r: number }[] = [];
    for (let w = 250; w <= 750; w += 50) {
      const lo = +FONTS[fam].range.split(' ')[0], hi = +FONTS[fam].range.split(' ')[1]; if (w < lo || w > hi) continue;
      const g = await geom(w); const c = await render(fam, w, g.ls, g.size, s.text, fg, bg);
      curve.push({ w, r: mass(c, fg, bg) / refMass });
    }
    let wStar = curve[0].w;
    for (let i = 0; i < curve.length - 1; i++) if ((curve[i].r - 1) * (curve[i + 1].r - 1) <= 0) { const a = curve[i], b = curve[i + 1]; wStar = a.w + ((1 - a.r) / (b.r - a.r)) * (b.w - a.w); break; }
    if (curve.every((c) => c.r > 1)) wStar = curve[0].w; if (curve.every((c) => c.r < 1)) wStar = curve[curve.length - 1].w;
    wStar = Math.round(wStar / 10) * 10;
    // 2) score at w* with sub-pixel offset search
    const score = async (w: number) => {
      const g = await geom(w); let best: ReturnType<typeof alignedDiff> | null = null; let cb = rb;
      for (const sub of [0, 1 / 6]) { const c = await render(fam, w, g.ls, g.size, s.text, fg, bg, sub); const d = alignedDiff(ref, c, bg); if (!best || d.mismatch < best.mismatch) { best = d; cb = inkBBox(c, bg)!; } }
      return { d: best!, g, cb };
    };
    const a = await score(wStar);
    const lo = Math.max(300, Math.floor(wStar / 100) * 100), hi = Math.min(800, Math.ceil(wStar / 100) * 100);
    const sl = await score(lo), sh = hi === lo ? sl : await score(hi);
    const stdW = sl.d.mismatch <= sh.d.mismatch ? lo : hi; const b = stdW === lo ? sl : sh;
    if (fam === "Plus Jakarta Sans") console.log(`    [${s.id}] w${lo}: ${sl.d.pctInk.toFixed(2)}%  w${hi}: ${sh.d.pctInk.toFixed(2)}%`);
    fits.push({ font: fam, weight: wStar, ls: a.g.ls, size: +a.g.size.toFixed(2), pctInk: +a.d.pctInk.toFixed(2), pctArea: +a.d.pctArea.toFixed(2), inkHRef: rb.h, inkHCand: a.cb.h, std: { weight: stdW, pctInk: +b.d.pctInk.toFixed(2) } });
    imgs[fam] = a.d;
  }
  fits.sort((a, b) => a.pctInk - b.pctInk);
  results[s.id] = fits;
  console.log(`\n${s.id}  "${s.text}"  fg ${hex(fg)} bg ${hex(bg)}  ref ink ${rb.w}x${rb.h}`);
  for (const f of fits) console.log(`  ${f.font.padEnd(18)} w${String(f.weight).padEnd(4)} ls ${f.ls}em  ${f.size}px  ink-mismatch ${String(f.pctInk).padEnd(6)}% area ${String(f.pctArea).padEnd(5)}%  inkH ${f.inkHRef}/${f.inkHCand}   [std w${f.std.weight}: ${f.std.pctInk}%]`);
  cmpRows.push({ label: s.id, note: `"${s.text}"\nbest: ${fits[0].font}`, imgs: [{ cap: 'reference', png: imgs['Plus Jakarta Sans'].ref }, ...fits.map((x) => x.font).map((f) => { const r = fits.find((x) => x.font === f)!; return { cap: `${f} w${r.weight} · ${r.pctInk}%`, png: imgs[f].cand }; })] });
  const p = fits.find((x) => x.font === 'Plus Jakarta Sans')!;
  pjsRows.push({ label: s.id, note: `w${p.weight} · ${p.size}px · ls ${p.ls}em\nink ${p.pctInk}% · area ${p.pctArea}%`, imgs: [{ cap: 'reference', png: imgs['Plus Jakarta Sans'].ref }, { cap: 'Plus Jakarta Sans', png: imgs['Plus Jakarta Sans'].cand }, { cap: 'diff (red = mismatch, yellow = AA ignored)', png: imgs['Plus Jakarta Sans'].diff }] });
}

fs.writeFileSync(path.join(OUT, FONT_ONLY ? 'fontfit-pjs.json' : 'fontfit.json'), JSON.stringify(results, null, 2));
console.log('\n=== mean ink-mismatch % (mass-matched weight) ===');
for (const f of FONT_ONLY ? [FONT_ONLY] : Object.keys(FONTS)) {
  const v = Object.values(results).map((r) => r.find((x) => x.font === f)!.pctInk);
  const wins = Object.values(results).filter((r) => r[0].font === f).length;
  console.log(`  ${f.padEnd(18)} mean ${(v.reduce((a, b) => a + b, 0) / v.length).toFixed(2)}%   best on ${wins}/${v.length}`);
}
if (!FONT_ONLY) console.log(await sheet('font-comparison.png', 'Font candidates: reference vs best fit per font (ink-mismatch %)', cmpRows, 0.5));
console.log(await sheet('font-pjs-diff.png', 'Plus Jakarta Sans: reference / render / pixel diff', pjsRows, 0.5));
await closeBrowser();
