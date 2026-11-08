// Functional smoke test of role-based routing (docs/decisions.md 2026-11-09): each role lands in its own app, can't
// open another role's screens, staff never get the student tab bar, and a two-role account chooses and switches.
// Seeded FAKE users. Uses a running dev stack, or starts one with relaxed sign-in limits (dev-stack.ts).
// Screenshots for review go to tools/ui-analysis/out/roles-*.png (gitignored).
//
//   node tools/ui-analysis/src/smoke-roles.ts
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Page } from 'playwright';
import { CLIENT as BASE, devStack } from './dev-stack.ts';

const OUT = new URL('../out/', import.meta.url);
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const path = (p: Page) => new URL(p.url()).pathname;
const shot = (p: Page, name: string) => p.screenshot({ path: fileURLToPath(new URL(`roles-${name}.png`, OUT)) });

const stack = await devStack({ reuse: true });
const browser: Browser = await chromium.launch();

async function signIn(email: string, password: string, viewport = { width: 360, height: 800 }, colorScheme: 'dark' | 'light' = 'dark') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in/email`);
  await page.getByPlaceholder('name@college.edu').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 15_000 });
  await page.waitForLoadState('networkidle');
  return { ctx, page };
}

/** Opening `to` ends on `expected` (the guard sends the user to their own app). */
async function blocked(page: Page, to: string, expected: string) {
  await page.goto(BASE + to);
  await page.waitForURL((u) => u.pathname === expected, { timeout: 10_000 }).catch(() => undefined);
  check(path(page) === expected, `${to} -> ${path(page)} (expected ${expected})`);
}
const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Main' }).count();
/** Waits (up to 5 s) for a locator to appear: after a client-side navigation the URL changes before React renders. */
const seen = (l: ReturnType<Page['locator']>) => l.first().waitFor({ timeout: 5_000 }).then(() => true, () => false);

try {
  // ---- student: the student app only ----
  {
    const { ctx, page } = await signIn('arjun.rao@example.com', 'Student@2026');
    check(path(page) === '/home', `student lands on /home (${path(page)})`);
    check((await tabBar(page)) === 1, 'student has the tab bar');
    for (const to of ['/warden', '/warden/scan', '/admin', '/admin/users', '/choose']) await blocked(page, to, '/home');
    await page.goto(`${BASE}/profile`);
    await page.getByRole('heading', { level: 2, name: 'Arjun Kumar Rao' }).waitFor();
    check((await page.getByRole('link', { name: 'Switch role' }).count()) === 0, 'a single-role student has no "Switch role" row (My Profile unchanged)');
    await ctx.close();
  }

  // ---- warden: phone-first warden app, no student screens ----
  {
    const { ctx, page } = await signIn('meera.nair@example.com', 'Warden@2026');
    check(path(page) === '/warden', `warden lands on /warden (${path(page)})`);
    check((await tabBar(page)) === 0, 'warden has no student tab bar');
    check((await page.getByRole('heading', { level: 1 }).textContent())?.endsWith(', Meera') ?? false, 'warden home greets by first name');
    check((await page.getByRole('link', { name: /Scan entry passes/ }).count()) === 1, 'warden home lists the scanner');
    await shot(page, 'warden-home');
    for (const to of ['/home', '/notifications', '/profile', '/profile/entry-pass', '/admin', '/admin/audit', '/choose']) await blocked(page, to, '/warden');
    await page.getByRole('link', { name: /Today's attendance/ }).click();
    await page.waitForURL('**/warden/attendance');
    check(await seen(page.getByText('Coming soon')), "Today's attendance opens its (next-checkpoint) page");
    await page.getByRole('button', { name: /^Account/ }).click();
    const menu = page.locator('[popover]');
    await menu.waitFor();
    check((await menu.getByText('Switch to').count()) === 0, 'a single-role warden gets no switcher');
    await menu.getByRole('button', { name: 'Sign out' }).click();
    await page.waitForURL((u) => u.pathname === '/');
    check(true, 'warden signs out from the account menu');
    await ctx.close();
  }

  // ---- admin: desktop layout with a sidebar, no student or warden screens ----
  {
    const { ctx, page } = await signIn('rahul.verma@example.com', 'Admin@2026', { width: 1280, height: 800 }, 'light');
    check(path(page) === '/admin', `admin lands on /admin (${path(page)})`);
    check((await tabBar(page)) === 0, 'admin has no student tab bar');
    const nav = page.getByRole('navigation', { name: 'Admin sections' });
    check((await nav.getByRole('link').count()) === 5, 'admin sections: Overview, Users, Hostel, Support, Audit log');
    const box = await nav.boundingBox();
    check(!!box && box.height > box.width, 'at desktop width the sections are a sidebar');
    await shot(page, 'admin-home-desktop');
    for (const to of ['/home', '/profile', '/warden', '/warden/scan']) await blocked(page, to, '/admin');
    await nav.getByRole('link', { name: 'Audit log' }).click();
    await page.waitForURL('**/admin/audit');
    check(await seen(nav.locator('a[aria-current="page"]', { hasText: 'Audit log' })), 'the open section is marked current');
    await page.setViewportSize({ width: 360, height: 800 });
    await page.goto(`${BASE}/admin`);
    const phoneBox = await nav.boundingBox();
    check(!!phoneBox && phoneBox.width > phoneBox.height, 'on a phone the sections are a strip under the header');
    await shot(page, 'admin-home-phone');
    await ctx.close();
  }

  // ---- two roles (student + warden): chooser, remembered choice, switching both ways ----
  {
    const { ctx, page } = await signIn('devika.menon@example.com', 'Both@2026');
    await page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('sb.area.')) localStorage.removeItem(k); });
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/choose');
    check(path(page) === '/choose', 'two roles and no choice yet: "Continue as"');
    const options = page.getByRole('list').getByRole('button');
    check((await options.count()) === 2 && (await options.nth(0).textContent())?.startsWith('Student') === true && (await options.nth(1).textContent())?.startsWith('Warden') === true,
      'the chooser offers exactly Student and Warden (no Admin)');
    await shot(page, 'choose');
    await page.getByRole('button', { name: /^Warden/ }).click();
    await page.waitForURL('**/warden');
    check((await tabBar(page)) === 0, 'as warden: the warden app, no tab bar');
    await blocked(page, '/admin', '/warden'); // the union of their roles, not more
    await page.goto(`${BASE}/`);
    await page.waitForURL('**/warden');
    check(path(page) === '/warden', 'the choice is remembered (next visit goes straight to /warden)');
    await page.getByRole('button', { name: /^Account/ }).click();
    const menu = page.locator('[popover]');
    check((await menu.getByRole('button', { name: 'Student' }).count()) === 1, 'the account menu offers "Switch to Student"');
    await shot(page, 'menu-switch');
    await menu.getByRole('button', { name: 'Student' }).click();
    await page.waitForURL('**/home');
    check(await seen(page.getByRole('navigation', { name: 'Main' })), 'switched: the student app with its tab bar');
    await page.goto(`${BASE}/profile`);
    await page.getByRole('heading', { level: 2, name: 'Devika Menon' }).waitFor();
    const row = page.getByRole('link', { name: 'Switch role' });
    check((await row.count()) === 1, 'My Profile shows "Switch role" for a two-role account');
    await row.scrollIntoViewIfNeeded();
    await shot(page, 'profile-switch-row');
    await row.click();
    await page.waitForURL('**/choose');
    check(true, '"Switch role" opens "Continue as"');
    await page.getByRole('heading', { name: 'Continue as' }).waitFor();
    // A reload straight into another page load (this used to sign the user out; fixed 2026-11-09).
    await page.reload({ waitUntil: 'commit' });
    await page.goto(`${BASE}/`);
    await page.waitForURL((u) => u.pathname !== '/', { timeout: 10_000 }).catch(() => undefined);
    check(path(page) === '/home', `and the last choice (Student) is what the next visit opens (${path(page)})`);
    await ctx.close();
  }
} catch (err) {
  failures.push(String(err));
  console.log(`FAIL ${String(err)}`);
} finally {
  await browser.close();
  stack.stop();
}
console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
