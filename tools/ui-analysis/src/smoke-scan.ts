// Functional end-to-end check of the warden scanner (Part B, 2026-11-11). Not a visual test (staff screens are
// free design). Against a running `npm run dev` (reused) or one it starts with relaxed sign-in limits.
//
// Two cameras:
// 1. Chromium's fake camera DEVICE fed from a .y4m file (--use-file-for-fake-video-capture): the real
//    getUserMedia → qr-scanner path. Chromium reads the file once when the camera opens, so it shows one picture:
//    a QR that isn't a pass (it must not reach the API).
// 2. For the timed cases (a pass lives 15 s + 5 s), a camera whose stream is a canvas the test draws on
//    (getUserMedia → canvas.captureStream()); qr-scanner, decoding and the API are all real. One scanner session sees
//    a forged pass, the student's real pass, the next one, and an expired one, in turn. Each pass picture is the
//    student's Entry Pass CANVAS pixels, so what is scanned is exactly what the student's screen shows, from the real
//    GET /attendance/qr-token.
// Also: camera refused / no camera messages, and on the student side the unread badge going up and
// "Attendance Marked" at the top of Notifications.
//
//   node tools/ui-analysis/src/smoke-scan.ts      (dev ports free, or a running `npm run dev:relaxed`)
// The student must not have been scanned in the last 5 minutes (the server's repeat guard), so wait between runs.
// SCAN_CAMERA_ONLY=1 runs only the camera-refused / no-camera checks (no scan, no wait).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium, type Browser } from 'playwright';
import { PNG } from 'pngjs';
import QRCode from 'qrcode';
import { CLIENT, devStack } from './dev-stack.ts';
import { CONSENT_POLICY_VERSION } from '../../../shared/src/consent.ts';

const OUT = fileURLToPath(new URL('../out/linux/', import.meta.url));
fs.mkdirSync(OUT, { recursive: true });
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const consent = { accepted: true, policyVersion: CONSENT_POLICY_VERSION };
const STUDENT = { email: 'arjun.rao@example.com', password: 'Student@2026', name: 'Arjun Kumar Rao', room: 'West CS240' };
const WARDEN = { email: 'meera.nair@example.com', password: 'Warden@2026' };
const READY = 'Point the camera at the student’s Entry Pass.';

// ---- camera 1: a one-frame YUV4MPEG2 (4:2:0) file, a QR image centred on white ------------------------------------
const W = 640, H = 480, QR_PX = 300; // inside qr-scanner's scan region (the middle 2/3 of 480 = 320)
function writeY4m(file: string, qr: PNG): void {
  const rgb = (x: number, y: number): [number, number, number] => {
    const ox = (W - QR_PX) / 2, oy = (H - QR_PX) / 2;
    if (x < ox || y < oy || x >= ox + QR_PX || y >= oy + QR_PX) return [255, 255, 255];
    const sx = Math.floor(((x - ox) / QR_PX) * qr.width), sy = Math.floor(((y - oy) / QR_PX) * qr.height);
    const i = (sy * qr.width + sx) * 4;
    const a = qr.data[i + 3]! / 255; // transparent = white
    return [0, 1, 2].map((c) => Math.round(qr.data[i + c]! * a + 255 * (1 - a))) as [number, number, number];
  };
  const Y = Buffer.alloc(W * H), U = Buffer.alloc((W / 2) * (H / 2)), V = Buffer.alloc((W / 2) * (H / 2));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [r, g, b] = rgb(x, y);
    Y[y * W + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    if (x % 2 === 0 && y % 2 === 0) {
      const j = (y / 2) * (W / 2) + x / 2;
      U[j] = Math.round(128 - 0.168736 * r - 0.331264 * g + 0.5 * b);
      V[j] = Math.round(128 + 0.5 * r - 0.418688 * g - 0.081312 * b);
    }
  }
  const frame = Buffer.concat([Buffer.from('FRAME\n'), Y, U, V]);
  fs.writeFileSync(file, Buffer.concat([Buffer.from(`YUV4MPEG2 W${W} H${H} F10:1 Ip A1:1 C420jpeg\n`), frame, frame]));
}
const qrDataUrl = (text: string) => QRCode.toDataURL(text, { errorCorrectionLevel: 'M', margin: 2, width: 410 });

/** A warden signed in (refresh cookie in the context's jar), on the scanner page. */
async function wardenPage(b: Browser, canvasCamera: boolean) {
  const ctx = await b.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  await ctx.grantPermissions(['camera'], { origin: CLIENT });
  if (canvasCamera) {
    await ctx.addInitScript(() => {
      const c = document.createElement('canvas');
      c.width = 960; c.height = 720; // qr-scanner looks at the middle 2/3 (480 px square)
      const g = c.getContext('2d')!;
      g.imageSmoothingQuality = 'high'; // smooth downscaling: the pass canvas has 11.9 px modules
      let picture: HTMLImageElement | null = null;
      const paint = () => {
        g.fillStyle = '#fff';
        g.fillRect(0, 0, 960, 720);
        if (picture) g.drawImage(picture, 270, 150, 420, 420);
      };
      paint();
      setInterval(paint, 100); // a canvas stream only sends frames when the canvas is painted
      (window as unknown as { __camera: (url: string | null) => Promise<void> }).__camera = (url) => new Promise((done) => {
        if (!url) { picture = null; paint(); done(); return; }
        const img = new Image();
        img.onload = () => { picture = img; paint(); done(); };
        img.src = url;
      });
      navigator.mediaDevices.getUserMedia = async () => c.captureStream(10);
    });
  }
  const res = await ctx.request.post(`${CLIENT}/api/v1/auth/login`, { data: { ...WARDEN, consent } });
  if (!res.ok()) throw new Error(`warden sign-in ${res.status()}`);
  const page = await ctx.newPage();
  const counter = { posts: 0 };
  page.on('request', (r) => { if (r.method() === 'POST' && r.url().endsWith('/attendance/scan')) counter.posts++; });
  await page.goto(`${CLIENT}/warden/scan`, { waitUntil: 'domcontentloaded', timeout: 90_000 }); // a cold dev page is ~400 modules
  return { page, counter };
}

// ---- camera refused, and no camera ---------------------------------------------------------------------------
  // A real refusal through Chromium's permission system (DevTools Browser.setPermission, the same state as a user's
  // "Block"): NotAllowedError, as on a phone.
async function cameraErrors(): Promise<void> {
  // Full Chromium in headless mode: Playwright's lighter headless shell can't open a camera without auto-accepting.
  const nb = await chromium.launch({ channel: 'chromium', args: ['--use-fake-device-for-media-stream'] });
  try {
    const nctx = await nb.newContext({ viewport: { width: 360, height: 800 } });
    await nctx.request.post(`${CLIENT}/api/v1/auth/login`, { data: { ...WARDEN, consent } });
    const np = await nctx.newPage();
    // This page's own browser context, for Chromium's permission setting
    const { targetInfo } = (await (await nctx.newCDPSession(np)).send('Target.getTargetInfo')) as { targetInfo: { browserContextId: string } };
    const bcdp = await nb.newBrowserCDPSession();
    const setCamera = (setting: 'denied' | 'granted') =>
      bcdp.send('Browser.setPermission', { permission: { name: 'camera' }, setting, origin: CLIENT, browserContextId: targetInfo.browserContextId });
    await setCamera('denied');
    await np.goto(`${CLIENT}/warden/scan`, { waitUntil: 'domcontentloaded', timeout: 90_000 });
    await np.getByRole('alert').waitFor({ timeout: 30_000 });
    const denied = ((await np.getByRole('alert').textContent()) ?? '').trim();
    check(/^Camera access is blocked/.test(denied) && (await np.getByRole('button', { name: 'Try again' }).count()) === 1, `camera refused: "${denied.slice(0, 50)}…" with Try again`);
    await np.screenshot({ path: path.join(OUT, 'scan-denied.png') });
    await setCamera('granted');
    await np.getByRole('button', { name: 'Try again' }).click();
    await np.getByText(READY).waitFor({ timeout: 15_000 });
    check(true, 'after allowing the camera, Try again starts it');
    await np.addInitScript(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(Object.assign(new Error('none'), { name: 'NotFoundError' }));
      navigator.mediaDevices.enumerateDevices = () => Promise.resolve([]);
    });
    await np.reload({ waitUntil: 'domcontentloaded', timeout: 90_000 });
    await np.getByRole('alert').waitFor({ timeout: 30_000 });
    const none = ((await np.getByRole('alert').textContent()) ?? '').trim();
    check(/^No camera found/.test(none) && (await np.getByRole('button', { name: 'Try again' }).count()) === 0, `no camera: "${none.slice(0, 40)}…"`);
  } finally {
    await nb.close();
  }
}

const stack = await devStack({ reuse: true });
const browser = await chromium.launch();
try {
  if (process.env.SCAN_CAMERA_ONLY) { await cameraErrors(); throw 'camera-only'; }
  // ---- camera 1: the real fake-camera device, showing a QR that isn't a pass ------------------------------------
  const notPassFile = path.join(OUT, 'scan-camera-not-a-pass.y4m');
  writeY4m(notPassFile, PNG.sync.read(Buffer.from((await qrDataUrl('https://example.com/menu')).split(',')[1]!, 'base64')));
  const deviceBrowser = await chromium.launch({
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-video-capture=${notPassFile}`],
  });
  try {
    const { page, counter } = await wardenPage(deviceBrowser, false);
    const result = page.locator('section[aria-label="Last scan"]');
    await result.waitFor({ timeout: 30_000 }).catch(async (e: unknown) => {
      await page.screenshot({ path: path.join(OUT, 'scan-device-timeout.png') });
      console.log('page:', (await page.locator('body').textContent())?.slice(0, 300), '| url', page.url());
      throw e;
    });
    const title = (await result.locator('p').first().textContent()) ?? '';
    check(title === 'Not an entry pass' && counter.posts === 0, `camera device: a QR that isn't a pass reads "${title}" and isn't sent to the API (${counter.posts} requests)`);
    await page.screenshot({ path: path.join(OUT, 'scan-not-a-pass.png') });
  } finally {
    await deviceBrowser.close();
  }

  // ---- student: sign in, note the unread badge ------------------------------------------------------------------
  const sctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
  const student = await sctx.newPage();
  const issued: string[] = [];
  student.on('response', async (r) => {
    if (r.url().endsWith('/attendance/qr-token') && r.ok()) issued.push(((await r.json()) as { token: string }).token);
  });
  await student.goto(`${CLIENT}/sign-in/email`);
  await student.getByPlaceholder('name@college.edu').fill(STUDENT.email);
  await student.getByPlaceholder('Enter your password').fill(STUDENT.password);
  await student.getByRole('checkbox').check();
  await student.getByRole('button', { name: 'Log in' }).click();
  await student.waitForURL('**/home');
  const badge = () => student.getByRole('navigation', { name: 'Main' }).locator('[aria-label$="unread"]');
  const unread = async () => ((await badge().count()) ? Number(((await badge().textContent()) ?? '0').replace('+', '')) : 0);
  await student.waitForTimeout(800);
  const before = await unread();
  check(true, `student signed in; unread badge ${before || 'hidden'}`);

  /** The pass on the student's screen (its canvas pixels), plus the token the API issued for it. */
  const passPicture = async (): Promise<{ url: string; token: string }> => {
    const canvas = student.locator('canvas[aria-label="Your entry pass QR code"]');
    await canvas.waitFor();
    await student.waitForTimeout(300);
    return { url: await canvas.evaluate((c: HTMLCanvasElement) => c.toDataURL('image/png')), token: issued.at(-1) ?? '' };
  };

  // ---- camera 2: one scanner session, pictures in turn ----------------------------------------------------------
  const { page: warden, counter } = await wardenPage(browser, true);
  const ready = warden.getByText(READY);
  await ready.waitFor({ timeout: 30_000 });
  check(true, 'the scanner opens the camera and waits for a pass');
  const result = warden.locator('section[aria-label="Last scan"]');
  const show = (url: string | null) => warden.evaluate((u) => (window as unknown as { __camera: (u: string | null) => Promise<void> }).__camera(u), url);

  /** Show a picture; wait for the scanner to take it and answer; then blank the camera and wait until it's ready again. */
  const scan = async (url: string, label: string) => {
    const t0 = Date.now();
    await show(url);
    await ready.waitFor({ state: 'hidden', timeout: 10_000 });
    await warden.getByText('Checking…').waitFor({ state: 'hidden', timeout: 15_000 });
    const ps = await result.locator('p').allTextContents();
    const took = ((Date.now() - t0) / 1000).toFixed(1);
    await warden.screenshot({ path: path.join(OUT, `scan-${label}.png`) });
    return { title: ps[0] ?? '', lines: ps.slice(1).join(' | '), took };
  };
  const clear = async () => { await show(null); await ready.waitFor({ timeout: 10_000 }); };

  let r = await scan(await qrDataUrl(`${'A'.repeat(52)}.${'B'.repeat(43)}`), 'forged');
  check(r.title === 'Code not accepted' && /not a valid SpaceBasic QR code/.test(r.lines), `a forged pass: "${r.title}" / "${r.lines}"`);
  await clear();

  // the real pass
  await student.goto(`${CLIENT}/profile/entry-pass`);
  const pass1 = await passPicture();
  check(pass1.token.length === 96, 'the Entry Pass shows a 96-character token from GET /attendance/qr-token (the real API)');
  const p0 = counter.posts;
  r = await scan(pass1.url, 'marked');
  const firstOk = r.title === 'Attendance marked';
  check(firstOk && r.lines === `${STUDENT.name} | ${STUDENT.room}`, `scanning the student's screen: "${r.title}" / "${r.lines}" (${r.took} s)`);
  if (!firstOk && /a moment ago/.test(r.lines)) console.log('     (this student was scanned in the last 5 minutes: run again after that)');
  await ready.waitFor({ timeout: 10_000 }); // resumes by itself, with the pass still in view
  await warden.waitForTimeout(1500);
  check(counter.posts - p0 === 1, `the scanner is ready again by itself and doesn't re-send the code still in view (${counter.posts - p0} request)`);
  await clear();

  // the next code (rotated) within 5 minutes: taken without a tap; "marked a moment ago"
  const seen = issued.length;
  for (let i = 0; i < 150 && issued.length === seen; i++) await student.waitForTimeout(100);
  await student.waitForTimeout(1200);
  const pass2 = await passPicture();
  check(pass2.token !== pass1.token, 'the pass shows a new code about every 10 s');
  r = await scan(pass2.url, 'again');
  check(r.title === 'Already marked' && /was marked a moment ago/.test(r.lines), `the next pass, same student within 5 minutes: "${r.title}" / "${r.lines}"`);
  await clear();

  // an expired code: the picture of a code, shown after more than 15 s + 5 s. A NEW code: the scanner never sends
  // the same code twice in a row, so wait for the pass to rotate first.
  const seen2 = issued.length;
  for (let i = 0; i < 150 && issued.length === seen2; i++) await student.waitForTimeout(100);
  await student.waitForTimeout(1200);
  const old = await passPicture();
  check(old.token !== pass2.token, 'a third code, for the expiry check');
  await student.waitForTimeout(21_000);
  r = await scan(old.url, 'expired');
  check(r.title === 'Code not accepted' && /expired/.test(r.lines), `an expired code: "${r.title}" / "${r.lines}"`);

  // ---- student: badge up by one, "Attendance Marked" on top of Notifications, unread ----------------------------
  await student.goto(`${CLIENT}/home`);
  await student.waitForTimeout(1000);
  const after = await unread();
  check(firstOk ? after === before + 1 : true, `unread badge ${before} → ${after}${firstOk ? '' : ' (not checked: no new scan)'}`);
  await student.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: /Notifications/ }).click();
  await student.waitForURL('**/notifications');
  const firstRow = student.locator('li > button').first(); // newest first (Notifications.tsx)
  await firstRow.waitFor();
  const rowText = ((await firstRow.textContent()) ?? '').replace(/\s+/g, ' ').trim();
  check(/^Attendance Marked/.test(rowText), `top of Notifications: "${rowText}"`);
  check((await firstRow.getByLabel('Unread', { exact: true }).count()) === 1 || !firstOk, 'and it is unread');
  await student.screenshot({ path: path.join(OUT, 'scan-student-notifications.png') });

  await cameraErrors();
} catch (e) {
  if (e !== 'camera-only') throw e;
} finally {
  await browser.close();
  stack.stop();
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
