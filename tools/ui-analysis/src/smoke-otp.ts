// Functional smoke test of the one-time-code sign-in (SMS, WhatsApp, email) and Forgot password, through the UI.
// It starts the dev stack itself (dev-stack.ts), because the codes are only printed in the server console (OTP_PROVIDER
// console, the development default), and stops it at the end. The dev ports (5173, 4000) must be free.
// Uses the seeded FAKE users. The reset sets the student's password back to its seeded value.
//
//   node tools/ui-analysis/src/smoke-otp.ts
//
// The stack runs with RELAX_RATE_LIMITS=true (dev-stack.ts), so repeated runs don't hit the 5-codes-an-hour limit.
// The 30 s resend cooldown is unchanged (this script checks it).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { devStack } from './dev-stack.ts';
import { chromium, type Page } from 'playwright';

const BASE = 'http://localhost:5173';
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };

// The 30 s resend cooldown is real even with relaxed limits (this script checks it), and it outlives a restart:
// a run started right after the last one waits it out first.
const LAST_RUN = fileURLToPath(new URL('../out/smoke-otp.last', import.meta.url));
try {
  const left = Number(fs.readFileSync(LAST_RUN, 'utf8')) + 31_000 - Date.now();
  if (left > 0) { console.log(`(waiting ${Math.ceil(left / 1000)} s for the last run's resend cooldown)`); await new Promise((r) => setTimeout(r, left)); }
} catch { /* first run */ }
process.on('exit', () => { try { fs.mkdirSync(path.dirname(LAST_RUN), { recursive: true }); fs.writeFileSync(LAST_RUN, String(Date.now())); } catch { /* best effort */ } });

// ---- dev stack (sign-in and code limits relaxed), with the console OTPs collected ---------------------------
const codes: { channel: string; to: string; code: string; purpose: string }[] = [];
const stack = await devStack({
  reuse: false, // the codes are read from this stack's console
  onLine: (line) => {
    const m = /OTP\s+(EMAIL|SMS|WHATSAPP)\s+(\S+)\s+->\s+(\d{4})\s+\((\w+)/.exec(line);
    if (m) codes.push({ channel: m[1]!.toLowerCase(), to: m[2]!, code: m[3]!, purpose: m[4]! });
  },
});

async function until<T>(what: string, fn: () => T | undefined | false | Promise<T | undefined | false>, ms = 90_000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** The newest code printed for `to` after `since` codes had been seen. */
const codeFor = (to: string, since: number) =>
  until(`a code for ${to}`, () => codes.slice(since).reverse().find((c) => c.to === to), 15_000);

async function signOut(page: Page) {
  if (/^\/(warden|admin)/.test(new URL(page.url()).pathname)) {
    // staff: the account menu (role routing, decisions.md 2026-11-09)
    await page.getByRole('button', { name: /^Account/ }).click();
    await page.locator('[popover]').getByRole('button', { name: 'Sign out' }).click();
  } else {
    await page.getByRole('link', { name: 'My Profile' }).click();
    await page.getByRole('button', { name: 'Sign Out' }).click();
  }
  await page.waitForURL((u) => new URL(u).pathname === '/');
}

/** Wait for the code screen; if the page shows an error instead (e.g. the hourly limit), fail with its text. */
async function codeScreen(page: Page, path: string) {
  const opened = await Promise.race([
    page.waitForURL(`**${path}`, { timeout: 15_000 }).then(() => true),
    page.getByRole('alert').waitFor({ timeout: 15_000 }).then(() => false),
  ]);
  if (!opened) throw new Error(`no code screen; the page says: "${await page.getByRole('alert').textContent()}"`);
}

async function typeCode(page: Page, code: string) {
  await page.getByLabel('Four-digit code').fill(code);
}

try {

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 780 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();

  // ---- SMS: Send code -> code screen; wrong code; Back keeps the number; resend cooldown; right code -> Home ----
  await page.goto(`${BASE}/sign-in/mobile`);
  await page.getByPlaceholder('98765 43210').fill('9000000001');
  check(await page.getByPlaceholder('98765 43210').inputValue() === '90000 00001', 'mobile number is shown as 5+5');
  check(await page.getByRole('button', { name: 'Send code' }).isDisabled(), 'Send code is disabled until consent');
  await page.getByRole('button', { name: 'Send it on WhatsApp instead' }).click();
  check(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.type === 'checkbox'),
    'a code link tapped before consent moves focus to the consent box');
  await page.getByRole('checkbox').check();
  let seen = codes.length;
  await page.getByRole('button', { name: 'Send code' }).click();
  await codeScreen(page, '/sign-in/code');
  check(true, 'Send code opens the code screen');
  check(await page.getByText('We sent a four-digit code to +91 90000 00001.').waitFor({ timeout: 10_000 }).then(() => true, () => false), 'code screen names the number');
  check(/^Resend code in 0:(2[7-9]|30)$/.test((await page.getByText(/^Resend code in/).textContent()) ?? ''), 'resend countdown starts at 0:30');
  const sms = await codeFor('+919000000001', seen);
  check(sms.channel === 'sms' && sms.purpose === 'login', `SMS code printed in the console (${sms.channel}, ${sms.purpose})`);

  const wrong = sms.code === '1111' ? '2222' : '1111';
  await typeCode(page, wrong); // four digits submit by themselves
  await page.getByRole('alert').waitFor({ timeout: 15_000 });
  check((await page.getByRole('alert').textContent()) === 'That code is wrong or has expired. Check it, or ask for a new one.', 'a wrong code shows the code message');
  check(await page.getByLabel('Four-digit code').inputValue() === '', 'a wrong code clears the boxes');

  await page.getByRole('button', { name: 'Back' }).click();
  await page.waitForURL('**/sign-in/mobile');
  check(await page.getByPlaceholder('98765 43210').inputValue() === '90000 00001', 'Back from the code screen keeps the number');
  check(!(await page.getByRole('checkbox').isChecked()), 'consent has to be ticked again');
  await page.getByRole('checkbox').check();
  seen = codes.length;
  const again = page.waitForResponse((r) => r.url().endsWith('/auth/otp/request'));
  await page.getByRole('button', { name: 'Send code' }).click();
  const againRes = await again;
  const retryAfter = Number(await againRes.headerValue('retry-after'));
  await codeScreen(page, '/sign-in/code');
  await page.getByText(/^Resend code in/).waitFor();
  await page.waitForTimeout(500); // give a (wrongly) printed new code time to show up in the log
  const left = Number(/0:(\d\d)$/.exec((await page.getByText(/^Resend code in/).textContent()) ?? '')?.[1]);
  check(againRes.status() === 429 && codes.length === seen && left > 0 && left <= retryAfter,
    `asking again inside the cooldown: ${againRes.status()}, no new code (${codes.length - seen}), code screen counts down from Retry-After (0:${left} <= ${retryAfter})`);

  await page.reload();
  check(await page.getByText('We sent a four-digit code to +91 90000 00001.').waitFor({ timeout: 10_000 }).then(() => true, () => false), 'a reload keeps the code screen');
  await typeCode(page, sms.code);
  await page.waitForURL('**/home', { timeout: 15_000 });
  check(true, 'the right SMS code signs the student in');
  await signOut(page);

  // ---- WhatsApp (warden) ------------------------------------------------------------------------------------
  await page.goto(`${BASE}/sign-in/mobile`);
  await page.getByPlaceholder('98765 43210').fill('90000 00002');
  await page.getByRole('checkbox').check();
  seen = codes.length;
  await page.getByRole('button', { name: 'Send it on WhatsApp instead' }).click();
  await codeScreen(page, '/sign-in/code');
  check(await page.getByText('We sent a four-digit code to +91 90000 00002 on WhatsApp.').waitFor({ timeout: 10_000 }).then(() => true, () => false), 'WhatsApp code screen');
  const wa = await codeFor('+919000000002', seen);
  check(wa.channel === 'whatsapp', 'WhatsApp code printed in the console');
  await typeCode(page, wa.code);
  await page.waitForURL('**/warden', { timeout: 15_000 });
  check(true, 'the WhatsApp code signs the warden in (to the warden app)');
  await signOut(page);

  // ---- invalid number: no request, message in the helper line ----------------------------------------------
  await page.goto(`${BASE}/sign-in/mobile`);
  await page.getByPlaceholder('98765 43210').fill('12345');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Send code' }).click();
  check((await page.getByRole('alert').textContent()) === 'Enter a valid 10-digit mobile number', 'an invalid number is caught before sending');

  // ---- email one-time code (admin) -----------------------------------------------------------------------
  await page.goto(`${BASE}/sign-in/email`);
  await page.getByPlaceholder('name@college.edu').fill('Rahul.Verma@example.com');
  await page.getByRole('checkbox').check();
  seen = codes.length;
  await page.getByRole('button', { name: 'Email me a one-time code instead' }).click();
  await codeScreen(page, '/sign-in/code');
  check(await page.getByText('We sent a four-digit code to rahul.verma@example.com.').waitFor({ timeout: 10_000 }).then(() => true, () => false), 'email code screen (address normalised)');
  const em = await codeFor('rahul.verma@example.com', seen);
  check(em.channel === 'email', 'email code printed in the console');
  await typeCode(page, em.code);
  await page.waitForURL('**/admin', { timeout: 15_000 });
  check(true, 'the email code signs the admin in (to the admin app)');
  await signOut(page);

  // ---- Forgot password (student) ---------------------------------------------------------------------------
  await page.goto(`${BASE}/sign-in/email`);
  await page.getByPlaceholder('name@college.edu').fill('arjun.rao@example.com');
  await page.getByRole('button', { name: 'Forgot password?' }).click();
  await page.waitForURL('**/forgot-password');
  check(await page.getByPlaceholder('name@college.edu').inputValue() === 'arjun.rao@example.com', 'Forgot password keeps the typed email');
  seen = codes.length;
  await page.getByRole('button', { name: 'Send code' }).click();
  await codeScreen(page, '/forgot-password/code');
  const rc = await codeFor('arjun.rao@example.com', seen);
  check(rc.purpose === 'reset_password', 'reset code printed in the console');
  await typeCode(page, rc.code);
  check(await page.evaluate(() => (document.activeElement as HTMLInputElement | null)?.autocomplete === 'new-password'), 'the fourth digit moves to New password');
  await page.getByPlaceholder('At least 8 characters').fill('short');
  await page.getByRole('button', { name: 'Reset password' }).click();
  check((await page.getByRole('alert').textContent()) === 'Use at least 8 characters', 'a short password is refused before sending');
  await page.getByPlaceholder('At least 8 characters').fill('Student@2026'); // back to the seeded password
  await page.getByRole('button', { name: 'Reset password' }).click();
  await page.getByRole('heading', { name: 'Password changed' }).waitFor({ timeout: 15_000 });
  check(true, 'reset shows "Password changed"');
  await page.getByRole('button', { name: 'Back to sign in' }).click();
  await page.waitForURL('**/sign-in/email');
  check(await page.getByPlaceholder('name@college.edu').inputValue() === 'arjun.rao@example.com', 'Back to sign in keeps the email');
  await page.getByPlaceholder('Enter your password').fill('Student@2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/home', { timeout: 15_000 });
  check(true, 'the student signs in with the new password');

  // a used reset code can't be used again
  const reuse = await fetch('http://127.0.0.1:4000/api/v1/auth/password/reset', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'arjun.rao@example.com', code: rc.code, newPassword: 'Another@2026' }),
  });
  check(reuse.status === 401, `a used reset code is refused (${reuse.status})`);

  await browser.close();
} catch (err) {
  failures.push(String(err));
  console.log(`FAIL ${String(err)}`);
} finally {
  if (failures.length) console.log(`\n--- last server lines ---\n${stack.log().split('\n').slice(-25).join('\n')}`);
  stack.stop();
}

console.log(failures.length ? `\n${failures.length} FAILED` : '\nall passed');
process.exit(failures.length ? 1 : 0);
