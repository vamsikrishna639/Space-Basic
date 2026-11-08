// Functional smoke test of signing in through the UI, against a running `npm run dev` (client :5173, API :4000,
// seeded FAKE users). Not a visual test: it runs on the host browser and checks behaviour only.
//
//   node tools/ui-analysis/src/smoke-signin.ts [baseUrl]
import { fileURLToPath } from 'node:url';
import { chromium, type Page } from 'playwright';
import { CONSENT_POLICY_VERSION } from '../../../shared/src/consent.ts';

const BASE = process.argv[2] ?? 'http://localhost:5173';
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
const unreadBefore = await page.getByLabel('Unread').count();
if (unreadBefore === 0) {
  console.log('skip all seeded notifications are already read (dev data from earlier runs)');
} else {
  const badgeBefore = await badgeCount();
  await page.locator('li', { has: page.getByLabel('Unread') }).first().getByRole('button').click();
  await page.waitForURL('**/m/**');
  await page.getByText('Coming soon').waitFor();
  check(true, `an unread notification opens its module (${new URL(page.url()).pathname})`);
  await page.goBack();
  await page.waitForURL('**/notifications');
  await page.locator('li').first().waitFor();
  check(await page.getByLabel('Unread').count() === unreadBefore - 1, 'the opened notification is now read');
  check(await badgeCount() === badgeBefore - 1, `the badge went down by one (${badgeBefore} -> ${await badgeCount()})`);
  await page.reload();
  await page.locator('li').first().waitFor();
  check(await page.getByLabel('Unread').count() === unreadBefore - 1, 'read state survives a reload (stored on the server)');
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
await page.getByRole('link', { name: /Show my QR code/ }).click();
await page.getByRole('heading', { name: 'Entry Pass' }).waitFor();
check(true, '"Show my QR code" opens the Entry Pass placeholder (built at the next checkpoint)');
await page.goBack();
await page.waitForURL('**/profile');
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

// the other seeded roles can sign in too
for (const [email, pw] of [['meera.nair@example.com', 'Warden@2026'], ['rahul.verma@example.com', 'Admin@2026']] as const) {
  const fresh = await browser.newContext({ viewport: { width: 360, height: 800 } }); // no shared session cookie
  const p = await fresh.newPage();
  await signIn(p, email, pw);
  await p.waitForURL('**/home', { timeout: 15_000 }).then(() => check(true, `${email} signs in`), () => check(false, `${email} signs in`));
  await fresh.close();
}

await browser.close();
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
