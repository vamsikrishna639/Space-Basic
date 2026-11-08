// Functional smoke test of signing in through the UI, against a running `npm run dev` (client :5173, API :4000,
// seeded FAKE users). Not a visual test: it runs on the host browser and checks behaviour only.
//
//   node tools/ui-analysis/src/smoke-signin.ts [baseUrl]
import { chromium, type Page } from 'playwright';

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
check(badge !== null && /^\d+\+?$/.test(badge), `unread badge: ${badge}`);
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

// sign out (temporary button on the My Profile placeholder) returns to Welcome, and stays signed out
await page.getByRole('link', { name: 'My Profile' }).click();
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
