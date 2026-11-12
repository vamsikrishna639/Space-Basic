// Functional smoke test of signing in through the UI (seeded FAKE users). Not a visual test: it runs on the host
// browser and checks behaviour only. It uses a running dev stack if there is one (start it with
// `npm run dev:relaxed` for repeated runs), otherwise it starts one with relaxed sign-in limits and stops it at the
// end (dev-stack.ts).
//
//   node tools/ui-analysis/src/smoke-signin.ts
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import QRCode from 'qrcode'; // the client's renderer (root node_modules), to check the drawn modules
import { CLIENT, devStack } from './dev-stack.ts';
import { CONSENT_POLICY_VERSION } from '../../../shared/src/consent.ts';

const BASE = CLIENT;
const stack = await devStack({ reuse: true });
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

async function signIn(page: Page, email: string, password: string) {
  await page.goto(`${BASE}/sign-in/email`);
  await page.getByPlaceholder('name@college.edu').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Log in' }).click();
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, deviceScaleFactor: 3, colorScheme: 'dark' });
const page = await ctx.newPage();

// Welcome -> Sign in (email tab), consent gate
await page.goto(BASE + '/');
await page.getByRole('button', { name: 'Continue with email' }).click();
check(page.url().endsWith('/sign-in/email'), 'Welcome "Continue with email" opens the Email tab');
check(await page.getByRole('button', { name: 'Log in' }).isDisabled(), 'Log in is disabled until consent is ticked');

// wrong password: generic message, stays on Sign in
await signIn(page, 'arjun.rao@example.com', 'wrong-password');
await page.getByRole('alert').waitFor({ timeout: 15_000 });
check((await page.getByRole('alert').textContent())?.includes("We couldn't sign you in") ?? false, 'a wrong password shows the generic message');

// seeded student signs in and lands on Home
await signIn(page, 'arjun.rao@example.com', 'Student@2026');
await page.waitForURL('**/home', { timeout: 15_000 });
check(true, 'student signs in and lands on Home');
const greeting = await page.getByRole('heading', { level: 1 }).textContent();
check(/^Good (morning|afternoon|evening), ARJUN$/.test(greeting ?? ''), `greeting: "${greeting}"`);
check((await page.getByText('Presidency University').count()) === 1, 'institution name from the API');
const logoLoaded = await page.locator('header img').evaluate((img: HTMLImageElement) =>
  img.complete ? img.naturalWidth > 0 : new Promise<boolean>((r) => { img.onload = () => r(img.naturalWidth > 0); img.onerror = () => r(false); }));
check(logoLoaded, 'institution logo loads from /api/v1/institutions/:id/logo');
const badge = await page.getByRole('navigation', { name: 'Main' }).locator('[aria-label$="unread"]').textContent().catch(() => null);
check(badge === null ? true : /^\d+\+?$/.test(badge), badge === null ? 'unread badge hidden (no unread notifications left in the dev data)' : `unread badge: ${badge}`);
check((await page.getByRole('link', { name: 'Leave Manager' }).count()) === 1, 'Apps grid lists the enabled modules');

// the session survives a reload (refresh cookie; the access token is only in memory)
await page.reload();
await page.waitForURL('**/home');
await page.getByRole('heading', { level: 1 }).waitFor();
check(true, 'a reload keeps the user signed in');

// an app opens the ComingSoon placeholder
await page.getByRole('link', { name: 'Leave Manager' }).click();
await page.getByText('Coming soon').waitFor();
check((await page.getByRole('heading', { name: 'Leave Manager' }).count()) === 1, 'Leave Manager opens ComingSoon');
await page.getByRole('button', { name: 'Back' }).click();
await page.waitForURL('**/home');

// Notifications: the list comes from the API; opening an unread row marks it read, follows its deep link and
// lowers the badge. Each run reads one seeded notification for good, so after a few runs there may be none left.
const badgeCount = async () => Number((await page.getByRole('navigation', { name: 'Main' }).locator('[aria-label$="unread"]').textContent().catch(() => '0')) ?? 0);
await page.getByRole('link', { name: 'Notifications' }).click();
await page.waitForURL('**/notifications');
await page.getByRole('heading', { level: 1, name: 'Notifications' }).waitFor();
await page.locator('main li, li').first().waitFor({ timeout: 15_000 });
check((await page.locator('li').count()) > 0, `notifications listed (${await page.locator('li').count()})`);
check((await page.getByRole('heading', { level: 2 }).first().textContent())?.match(/^\d\d [A-Z]{3} \d{4}$/) !== null, 'day headings look like "25 OCT 2026"');
const unreadBefore = await page.getByLabel('Unread', { exact: true }).count();
if (unreadBefore === 0) {
  console.log('skip all seeded notifications are already read (dev data from earlier runs)');
} else {
  const badgeBefore = await badgeCount();
  await page.locator('li', { has: page.getByLabel('Unread', { exact: true }) }).first().getByRole('button').click();
  await page.waitForURL('**/m/**');
  await page.getByText('Coming soon').waitFor();
  check(true, `an unread notification opens its module (${new URL(page.url()).pathname})`);
  await page.goBack();
  await page.waitForURL('**/notifications');
  await page.locator('li').first().waitFor();
  check(await page.getByLabel('Unread', { exact: true }).count() === unreadBefore - 1, 'the opened notification is now read');
  check(await badgeCount() === badgeBefore - 1, `the badge went down by one (${badgeBefore} -> ${await badgeCount()})`);
  await page.reload();
  await page.locator('li').first().waitFor();
  check(await page.getByLabel('Unread', { exact: true }).count() === unreadBefore - 1, 'read state survives a reload (stored on the server)');
}
// Help (Support tab): Contact us and Common questions load from the API
await page.getByRole('link', { name: 'Support' }).click();
await page.waitForURL('**/support');
await page.getByRole('heading', { level: 1, name: 'Help' }).waitFor();
await page.getByRole('link', { name: /Contact us/ }).click();
await page.waitForURL('**/support/contact');
await page.getByRole('heading', { level: 2, name: 'Hostel office' }).waitFor({ timeout: 15_000 });
const tel = await page.locator('a[href^="tel:"]').first().getAttribute('href');
check(tel === 'tel:+919000000101', `Contact us lists the hostel office with a tel: link (${tel})`);
check((await page.getByRole('heading', { level: 2, name: 'SpaceBasic' }).count()) === 1, 'Contact us lists SpaceBasic contacts');
check((await page.getByText('+91 90000 00101').count()) === 1, 'phone numbers show as +91 98765 43210');
await page.getByRole('button', { name: 'Back' }).click();
await page.waitForURL('**/support');
await page.getByRole('link', { name: /Common questions/ }).click();
await page.waitForURL('**/support/faqs');
await page.getByRole('heading', { level: 2, name: 'Leave' }).waitFor({ timeout: 15_000 });
const answer = page.getByText('Your warden approves it first');
check(!(await answer.isVisible()), 'an answer is hidden until its question is opened');
await page.getByText('Who approves my leave?').click();
check(await answer.isVisible(), 'opening a question shows its answer');
check((await page.getByText('When is the mess menu updated?').count()) === 0, 'unpublished FAQs are not shown');
await page.getByRole('button', { name: 'Back' }).click();
await page.waitForURL('**/support');

await page.getByRole('link', { name: 'Home' }).click();
await page.waitForURL('**/home');

// My Profile: data from /users/me, the QR row, and a photo upload through the camera badge
await page.getByRole('link', { name: 'My Profile' }).click();
await page.waitForURL('**/profile');
await page.getByRole('heading', { level: 2, name: 'Arjun Kumar Rao' }).waitFor();
check(await page.getByRole('heading', { level: 2, name: 'Arjun Kumar Rao' }).evaluate((el) => getComputedStyle(el).textTransform) === 'uppercase', 'the name is shown in upper case');
check((await page.getByText('West CS240').count()) === 1, 'room chip "West CS240"');
check((await page.getByText('9000000001', { exact: true }).count()) === 1, 'phone shown as its 10 digits');
check((await page.getByText('arjun.rao@example.com').count()) === 1, 'email shown');
// Entry Pass: the sheet over My Profile; the QR drawn is exactly the token the API issued, and a warden can scan it.
// Every token the API hands out, in order. In development React's StrictMode runs the sheet's effect twice, so two
// tokens are issued on open and the second is the one drawn; the check is always against the latest.
const tokens: string[] = [];
page.on('response', (r) => {
  if (r.url().endsWith('/api/v1/attendance/qr-token') && r.status() === 200) void r.json().then((b: { token: string }) => tokens.push(b.token));
});
await page.getByRole('link', { name: /Show my QR code/ }).click();
const pass = page.getByRole('dialog');
await pass.waitFor();
check(page.url().endsWith('/profile/entry-pass'), '"Show my QR code" opens /profile/entry-pass');
check((await pass.getByText('Entry Pass', { exact: true }).count()) === 1 && (await pass.getByText('West CS240').count()) === 1
  && (await pass.getByRole('heading', { name: 'Arjun Kumar Rao' }).count()) === 1, 'the sheet shows ENTRY PASS, the name and the room');
check((await page.locator('section[aria-label="Your profile"]').count()) === 1, 'My Profile stays rendered under the sheet');
/** Module-by-module: the canvas's centre pixel of each module against qrcode's matrix for `token`. */
async function qrMismatch(token: string): Promise<{ size: number; bad: number }> {
  const qr = QRCode.create([{ data: new TextEncoder().encode(token), mode: 'byte' }], { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const bad = await pass.locator('canvas').evaluate((c: HTMLCanvasElement, { size, bits }) => {
    const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    const scale = c.width / (size + 2); // 1-module margin on each side
    let n = 0;
    for (let r = 0; r < size; r++) for (let k = 0; k < size; k++) {
      const x = Math.floor((k + 1.5) * scale), y = Math.floor((r + 1.5) * scale);
      if ((d[(y * c.width + x) * 4]! < 128) !== (bits[r * size + k] === 1)) n++;
    }
    return n;
  }, { size, bits: Array.from(qr.modules.data) });
  return { size, bad };
}
await pass.locator('canvas').waitFor();
await page.waitForTimeout(600);
const issued = tokens.at(-1) ?? '';
check(issued.length === 96, 'the pass token is 96 characters (always QR version 6-M)');
const shown = await qrMismatch(issued);
check(shown.size === 41 && shown.bad === 0, `the QR on screen encodes the issued token (${shown.size} x ${shown.size}, ${shown.bad} modules differ)`);
check(/^Expires in \d{1,2}s$/.test((await pass.getByText(/^Expires in/).textContent()) ?? ''), 'the countdown reads "Expires in Ns"');
const wardenApi = await browser.newContext();
const wSignin = await wardenApi.request.post(`${BASE}/api/v1/auth/login`, { data: { email: 'meera.nair@example.com', password: 'Warden@2026', consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } } });
const wToken = ((await wSignin.json()) as { accessToken: string }).accessToken;
const scanned = await wardenApi.request.post(`${BASE}/api/v1/attendance/scan`, { headers: { Authorization: `Bearer ${wToken}` }, data: { token: issued } });
const scanBody = (await scanned.json()) as { student?: { fullName: string }; error?: { message: string } };
// 409 "marked a moment ago" means the token verified but this student was scanned in the last 5 minutes (an earlier run).
check(scanned.status() === 201 ? scanBody.student?.fullName === 'Arjun Kumar Rao' : scanned.status() === 409 && /a moment ago/.test(scanBody.error?.message ?? ''),
  `a warden scanning the shown token marks attendance (${scanned.status()})`);
await wardenApi.close();
const seen = tokens.length;
for (let i = 0; i < 150 && tokens.length === seen; i++) await page.waitForTimeout(100); // the next code is fetched just before 10 s
await page.waitForTimeout(1500); // and swapped in when the cycle ends
const nextToken = tokens.at(-1) ?? '';
const rotated = await qrMismatch(nextToken);
check(nextToken !== issued && rotated.bad === 0, 'the code changes about every 10 s');
await pass.getByRole('button', { name: 'Close' }).click();
await page.waitForURL('**/profile');
await pass.waitFor({ state: 'detached' });
check(true, 'the close button slides the sheet away and returns to My Profile');
await page.getByRole('link', { name: /Show my QR code/ }).click();
await pass.waitFor();
await page.keyboard.press('Escape');
await page.waitForURL('**/profile');
check((await pass.count()) === 0, 'Escape closes the sheet too');
const profileAvatar = page.locator('section[aria-label="Your profile"] img');
const avatarSrc = () => profileAvatar.getAttribute('src');
const defaultSrc = await avatarSrc();
await page.locator('input[type="file"]').setInputFiles(fileURLToPath(new URL('../../../reference-ui/assets/avatar-default.png', import.meta.url)));
await page.waitForFunction(() => document.querySelector('section[aria-label="Your profile"] img')?.getAttribute('src')?.startsWith('blob:'), null, { timeout: 15_000 })
  .then(() => check(true, 'the camera badge uploads a photo and the profile shows it'), () => check(false, 'the camera badge uploads a photo and the profile shows it'));
await page.waitForFunction(() => document.querySelector('nav[aria-label="Main"] img')?.getAttribute('src')?.startsWith('blob:'), null, { timeout: 15_000 })
  .then(() => check(true, 'the tab-bar avatar shows the new photo too'), () => check(false, 'the tab-bar avatar shows the new photo too'));
await page.reload();
await page.waitForFunction(() => document.querySelector('section[aria-label="Your profile"] img')?.getAttribute('src')?.startsWith('blob:'), null, { timeout: 15_000 })
  .then(() => check(true, 'the photo survives a reload (stored on the server)'), () => check(false, 'the photo survives a reload (stored on the server)'));
// Put the seeded student back on the default avatar (DELETE /users/me/avatar with a fresh token).
const api = await browser.newContext();
const signin = await api.request.post(`${BASE}/api/v1/auth/login`, { data: { email: 'arjun.rao@example.com', password: 'Student@2026', consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } } });
const token = ((await signin.json()) as { accessToken: string }).accessToken;
const removed = await api.request.delete(`${BASE}/api/v1/users/me/avatar`, { headers: { Authorization: `Bearer ${token}` } });
check(removed.status() === 204, `photo removed again after the test (${removed.status()})`);
await api.close();
await page.reload();
await profileAvatar.waitFor();
check((await avatarSrc()) === defaultSrc, 'without a photo the default avatar is back');

// sign out with the real "Sign Out" row returns to Welcome, and stays signed out
await page.getByRole('button', { name: 'Sign Out' }).click();
await page.waitForURL((u) => new URL(u).pathname === '/');
await page.reload();
await page.waitForTimeout(800);
check(new URL(page.url()).pathname === '/', 'after sign-out a reload stays on Welcome');

// the other seeded roles sign in to their own apps (role routing is covered in smoke-roles.ts)
for (const [email, pw, home] of [['meera.nair@example.com', 'Warden@2026', '/warden'], ['rahul.verma@example.com', 'Admin@2026', '/admin']] as const) {
  const fresh = await browser.newContext({ viewport: { width: 360, height: 800 } }); // no shared session cookie
  const p = await fresh.newPage();
  await signIn(p, email, pw);
  await p.waitForURL(`**${home}`, { timeout: 15_000 }).then(() => check(true, `${email} signs in to ${home}`), () => check(false, `${email} signs in to ${home}`));
  await fresh.close();
}

await browser.close();
stack.stop(); // only stops a stack this script started
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
