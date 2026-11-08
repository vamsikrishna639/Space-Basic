// Functional smoke test: Settings, Change Password, Privacy & Consent, and the session fixes of 2026-11-09
// (a reload followed at once by another page load keeps you signed in; two tabs refreshing together).
// Seeded FAKE users; restores the passwords it changes. Uses a running dev stack or starts one (dev-stack.ts).
//
//   node tools/ui-analysis/src/smoke-settings.ts
import { chromium, type BrowserContext, type Page } from 'playwright';
import { CLIENT as BASE, devStack } from './dev-stack.ts';

const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const path = (p: Page) => new URL(p.url()).pathname;
const seen = (l: ReturnType<Page['locator']>, timeout = 5_000) => l.first().waitFor({ timeout }).then(() => true, () => false);

const stack = await devStack({ reuse: true });
const browser = await chromium.launch();

async function signIn(ctx: BrowserContext, email: string, password: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in/email`);
  await page.getByPlaceholder('name@college.edu').fill(email);
  await page.getByPlaceholder('Enter your password').fill(password);
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/sign-in'), { timeout: 15_000 });
  return page;
}
const value = (page: Page, label: string) => page.locator('dt', { hasText: new RegExp(`^${label}$`) }).locator('xpath=following-sibling::dd').textContent();

try {
  // ---- Settings ----
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    const page = await signIn(ctx, 'arjun.rao@example.com', 'Student@2026');
    await page.goto(`${BASE}/profile`);
    await page.getByRole('link', { name: 'Settings' }).click();
    await page.waitForURL('**/settings');
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    check(path(page) === '/settings', 'My Profile > Settings opens Settings');
    const version = await value(page, 'App version');
    const bundle = await value(page, 'Web bundle');
    check(version === '0.1.0', `App version from client/package.json (${version})`);
    check(new RegExp(`^${version!.replace(/\./g, '\\.')}-\\d{8}-\\d{6}-([0-9a-f]{8}|unknown)$`).test(bundle ?? ''), `Web bundle is version-date-time-commit (${bundle})`);
    check(/^\d{1,2} [A-Z][a-z]{2} \d{4}, \d{1,2}:\d{2} [AP]M$/.test((await value(page, 'Last updated')) ?? ''), 'Last updated reads like "3 Nov 2026, 1:52 PM"');
    const id1 = await value(page, 'Device ID');
    check(/^[0-9a-f]{16}$/.test(id1 ?? ''), `Device ID is 16 hex characters (${id1})`);
    for (const l of ['Operating system', 'OS version', 'Device', 'Model']) check(((await value(page, l)) ?? '').length > 0, `${l}: "${await value(page, l)}"`);

    const theme = () => page.evaluate(() => document.documentElement.dataset.theme);
    await page.getByRole('radio', { name: 'Light' }).click();
    check((await theme()) === 'light' && (await page.getByRole('radio', { name: 'Light' }).getAttribute('aria-checked')) === 'true', 'Appearance > Light switches the theme');
    await page.reload();
    await page.getByRole('heading', { name: 'Settings' }).waitFor();
    check((await theme()) === 'light', 'the choice survives a reload');
    check((await value(page, 'Device ID')) === id1, 'the device ID stays the same');
    await page.getByRole('radio', { name: 'System' }).click();
    check((await theme()) === 'dark', 'System follows the phone (dark here)');

    const haptics = page.getByRole('switch', { name: 'Haptic feedback' });
    check((await haptics.getAttribute('aria-checked')) === 'true', 'Haptic feedback is on by default');
    await haptics.click();
    await page.reload();
    check((await page.getByRole('switch', { name: 'Haptic feedback' }).getAttribute('aria-checked')) === 'false', 'turning it off is remembered');
    await page.getByRole('switch', { name: 'Haptic feedback' }).click();

    for (const [name, title] of [['Accessibility', 'Accessibility'], ['Check connection', 'Check connection']] as const) {
      await page.getByRole('link', { name: new RegExp(`^${name}`) }).click();
      check(await seen(page.getByText('Coming soon')) && (await page.getByRole('heading', { name: title }).count()) === 1, `${name} opens its Coming soon page`);
      await page.goBack();
      await page.getByRole('heading', { name: 'Settings' }).waitFor();
    }

    // A reload followed at once by another page load: used to sign out (decisions.md 2026-11-09).
    await page.reload({ waitUntil: 'commit' });
    await page.goto(`${BASE}/profile`);
    check(await seen(page.getByRole('heading', { level: 2, name: 'Arjun Kumar Rao' }), 10_000), 'a reload followed at once by another page load keeps you signed in');

    // Two tabs restoring the session at the same moment
    const [a, b] = await Promise.all([ctx.newPage(), ctx.newPage()]);
    await Promise.all([a.goto(`${BASE}/home`), b.goto(`${BASE}/notifications`)]);
    check(await seen(a.getByRole('navigation', { name: 'Main' }), 10_000) && await seen(b.getByRole('navigation', { name: 'Main' }), 10_000), 'two tabs opened together both stay signed in');
    await a.close(); await b.close();

    // Clear stored data: Cancel keeps everything; confirming signs out and clears storage
    await page.goto(`${BASE}/settings`);
    await page.getByRole('button', { name: /^Clear stored data/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Clear stored data?' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    check(path(page) === '/settings' && (await dialog.isVisible()) === false, 'Cancel closes the confirm and changes nothing');
    await page.getByRole('button', { name: /^Clear stored data/ }).click();
    await dialog.getByRole('button', { name: 'Clear and sign out' }).click();
    await page.waitForURL((u) => u.pathname === '/');
    const left = await page.evaluate(() => Object.keys(localStorage));
    check(left.length === 0, `confirming signs out and clears saved data (${left.length} keys left)`);
    await page.reload();
    await page.waitForTimeout(800);
    check(path(page) === '/', 'and stays signed out after a reload');
    await ctx.close();
  }

  // ---- Change Password ----
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'dark' });
    const page = await signIn(ctx, 'arjun.rao@example.com', 'Student@2026');
    await page.goto(`${BASE}/profile/password`);
    await page.getByLabel('Current password').fill('Student@2026');
    await page.getByLabel('New password', { exact: true }).fill('Student@2027');
    await page.getByLabel('New password again').fill('Student@2028');
    await page.getByRole('button', { name: 'Change password' }).click();
    check(await seen(page.getByText("The two new passwords don't match")), 'mismatched new passwords are caught');
    await page.getByLabel('New password', { exact: true }).fill('arjun.rao@example.com');
    await page.getByLabel('New password again').fill('arjun.rao@example.com');
    await page.getByRole('button', { name: 'Change password' }).click();
    check(await seen(page.getByText('The password must not be the email or mobile number')), 'the email as a password is refused');
    await page.getByLabel('Current password').fill('wrong-password');
    await page.getByLabel('New password', { exact: true }).fill('Student@2027');
    await page.getByLabel('New password again').fill('Student@2027');
    await page.getByRole('button', { name: 'Change password' }).click();
    check(await seen(page.getByText('That is not your current password')), 'a wrong current password is reported on its field');
    await page.getByLabel('Current password').fill('Student@2026');
    await page.getByRole('button', { name: 'Change password' }).click();
    check(await seen(page.getByRole('heading', { name: 'Password changed' })), 'a valid change succeeds and says so');
    await page.goto(`${BASE}/profile`);
    check(await seen(page.getByRole('heading', { level: 2, name: 'Arjun Kumar Rao' })), 'this device stays signed in');
    const fresh = await browser.newContext();
    const p2 = await signIn(fresh, 'arjun.rao@example.com', 'Student@2027');
    check(path(p2) === '/home', 'the new password signs in');
    await p2.goto(`${BASE}/profile/password`);
    await p2.getByLabel('Current password').fill('Student@2027');
    await p2.getByLabel('New password', { exact: true }).fill('Student@2026');
    await p2.getByLabel('New password again').fill('Student@2026');
    await p2.getByRole('button', { name: 'Change password' }).click();
    check(await seen(p2.getByRole('heading', { name: 'Password changed' })), 'the seeded password is restored');
    await fresh.close();
    await ctx.close();
  }

  // ---- Privacy & Consent (the two-role user, so the main student's data stays as it is) ----
  {
    const ctx = await browser.newContext({ viewport: { width: 360, height: 800 }, colorScheme: 'light' });
    const page = await signIn(ctx, 'devika.menon@example.com', 'Both@2026');
    await page.goto(`${BASE}/profile/privacy`);
    check(await seen(page.getByText('Given')), 'Privacy & Consent shows when consent was given');
    check(await seen(page.getByText(/^\d{4}-\d{2}-\d{2}$/)), 'and the policy version');
    await page.getByRole('button', { name: 'Withdraw consent' }).click();
    const dialog = page.getByRole('dialog', { name: 'Withdraw your consent?' });
    await dialog.getByRole('button', { name: 'Withdraw' }).click();
    await page.waitForURL((u) => u.pathname === '/', { timeout: 15_000 });
    check(true, 'withdrawing signs you out');
    const again = await signIn(ctx, 'devika.menon@example.com', 'Both@2026');
    check(!new URL(again.url()).pathname.startsWith('/sign-in'), 'signing in again (with the consent box ticked) works');
    await again.goto(`${BASE}/profile/privacy`);
    check(await seen(again.getByRole('heading', { name: 'History' })), 'the history lists the earlier, withdrawn consent');
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
