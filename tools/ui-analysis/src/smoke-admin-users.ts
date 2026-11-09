// Functional smoke test of the admin Users screens (FREE DESIGN: no visual diff; docs/decisions.md 2026-11-09):
// list and search, "Waiting for a room" + Accept with the room picker, the server refusing a bed that went in the
// meantime, Add user (validation, duplicate email, room), Edit (roles, room), Disable / Enable, your own account,
// CSV import, a phone-width pass. Seeded FAKE users; the users it creates get a per-run stamp and are disabled and
// moved out at the end, so it can run again and again. Uses a running dev stack or starts one (dev-stack.ts).
// Screenshots for review: tools/ui-analysis/out/admin-users-*.png (gitignored).
//
//   node tools/ui-analysis/src/smoke-admin-users.ts
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { CLIENT as BASE, devStack } from './dev-stack.ts';

const API = 'http://127.0.0.1:4000/api/v1';
const OUT = new URL('../out/', import.meta.url);
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const path = (p: Page) => new URL(p.url()).pathname;
const shot = (p: Page, name: string) => p.screenshot({ path: fileURLToPath(new URL(`admin-users-${name}.png`, OUT)) });
const seen = (l: Locator, timeout = 8_000) => l.first().waitFor({ timeout }).then(() => true, () => false);

const STAMP = Date.now().toString(36).slice(-6);
const created: string[] = []; // user ids to tidy up

// ---- API helper (the admin's own session, separate from the browser's) ----------------------------------
interface UserSummary { id: string; fullName: string; email: string | null; roles: string[]; status: string; room: { code: string; display: string } | null }
let token = '';
async function call<T>(method: string, p: string, body?: unknown): Promise<{ status: number; body: T }> {
  const res = await fetch(API + p, {
    method,
    headers: { authorization: `Bearer ${token}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: (res.status === 204 ? undefined : await res.json()) as T };
}
async function apiSignIn() {
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'rahul.verma@example.com', password: 'Admin@2026', consent: { accepted: true, policyVersion: (await (await fetch(`${API}/consent/policy`)).json() as { policyVersion: string }).policyVersion } }),
  });
  if (!res.ok) throw new Error(`API sign-in failed: ${res.status}`);
  token = ((await res.json()) as { accessToken: string }).accessToken;
}
async function makeStudent(name: string, roomCode?: string) {
  const r = await call<UserSummary>('POST', '/users', { fullName: name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@smoke.example.com`, roles: ['student'], ...(roomCode ? { roomCode } : {}) });
  if (r.status === 201) created.push(r.body.id);
  return r;
}
type Room = { code: string; beds: number; occupants: number };
const firstFreeRoom = async (q: string) =>
  (await call<{ items: Room[] }>('GET', `/hostel/rooms?free=true&q=${q}&limit=1`)).body.items[0]!;
/** A room nobody is in (this test's own rooms, so it doesn't depend on the seed data people change by hand). */
const emptyRoom = async (q: string, skip: string[] = []) =>
  (await call<{ items: Room[] }>('GET', `/hostel/rooms?free=true&q=${q}&limit=50`)).body.items.find((r) => r.occupants === 0 && !skip.includes(r.code))!;

const stack = await devStack({ reuse: true });
const browser: Browser = await chromium.launch();

async function signIn(viewport = { width: 1280, height: 860 }, colorScheme: 'dark' | 'light' = 'light') {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, colorScheme });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/sign-in/email`);
  await page.getByPlaceholder('name@college.edu').fill('rahul.verma@example.com');
  await page.getByPlaceholder('Enter your password').fill('Admin@2026');
  await page.getByRole('checkbox').check();
  await page.getByRole('button', { name: 'Log in' }).click();
  await page.waitForURL('**/admin', { timeout: 15_000 });
  return { ctx, page };
}

try {
  await apiSignIn();
  const { ctx, page } = await signIn();
  const rows = page.locator('tbody tr');
  const row = (name: string) => rows.filter({ has: page.getByRole('link', { name, exact: true }) });

  // ---- setup: a full room and a room with one student, both this run's own (API) ----
  const full = await emptyRoom('CT3');
  for (let i = 0; i < full.beds; i++) await makeStudent(`Smoke Full ${STAMP} ${i}`, full.code);
  const part = await emptyRoom('CT3', [full.code]);
  await makeStudent(`Smoke Part ${STAMP}`, part.code);

  // ---- list and search ----
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Users' }).click();
  await page.waitForURL('**/admin/users');
  check(await seen(row('Arjun Kumar Rao')), 'the list shows the seeded student');
  check((await row('Arjun Kumar Rao').textContent())?.includes('West CS240') ?? false, 'with their room "West CS240"');
  check((await rows.filter({ hasText: 'Space Basic Admin' }).count()) === 0, 'platform staff (super_admin) are not listed');
  await shot(page, 'list-desktop');

  const search = page.getByRole('searchbox', { name: 'Search users' });
  await search.fill(full.code.toLowerCase());
  await page.waitForURL((u) => u.searchParams.get('q') === full.code.toLowerCase());
  await page.waitForFunction((n) => document.querySelectorAll('tbody tr').length === n, full.beds, { timeout: 8_000 }).catch(() => undefined);
  const inRoom = await rows.allTextContents();
  check(inRoom.length === full.beds && inRoom.every((t) => t.includes(full.code)), `searching a room code lists its ${full.beds} students (${inRoom.length})`);
  await search.fill('zzzz-nobody');
  check(await seen(page.getByText('No users match "zzzz-nobody".')), 'an empty search says so');
  await page.reload();
  check((await search.inputValue()) === 'zzzz-nobody', 'the search survives a reload (it is in the URL)');
  await search.fill('');
  await page.waitForURL((u) => !u.searchParams.has('q'));

  // ---- Waiting for a room -> Accept ----
  const waiting = await makeStudent(`Smoke Waiting ${STAMP}`);
  check(waiting.status === 201, 'setup: a new student without a room (API)');
  await page.getByRole('button', { name: 'Waiting for a room' }).click();
  await page.waitForURL((u) => u.searchParams.get('view') === 'waiting');
  // The "All" list also holds the new student: wait until the housed seed student has gone from the table first.
  check(await row('Arjun Kumar Rao').first().waitFor({ state: 'detached', timeout: 8_000 }).then(() => true, () => false), 'students with a room are not in that view');
  check(await seen(row(waiting.body.fullName)), 'the new student is waiting for a room');
  await row(waiting.body.fullName).getByRole('button', { name: /^Accept/ }).click();
  const dialog = page.getByRole('dialog', { name: `Accept ${waiting.body.fullName}` });
  check(await seen(dialog), 'Accept opens the room picker');
  const options = dialog.getByRole('radio');
  check(await seen(options), 'the picker lists rooms');
  const roomSearch = dialog.getByRole('searchbox', { name: 'Search rooms by code' });
  await roomSearch.fill(full.code);
  check(await seen(dialog.getByText(`No room starting with ${full.code} has a free bed.`)), `the full room ${full.code} is not offered`);
  await roomSearch.fill(part.code);
  const partCard = dialog.locator('label').filter({ hasText: part.code });
  check(await seen(partCard) && /2 of 3 beds free/.test((await partCard.textContent()) ?? ''), `${part.code} shows its free beds (2 of 3)`);
  check((await dialog.getByRole('button', { name: /^Assign/ }).isDisabled()), 'Assign waits for a choice');
  await shot(page, 'picker');
  const target = await firstFreeRoom('CT3');
  await roomSearch.fill(target.code);
  await dialog.getByText(target.code, { exact: true }).click();
  await dialog.getByRole('button', { name: `Assign ${target.code}` }).click();
  check(await seen(page.getByText(`${waiting.body.fullName} is now in West ${target.code}.`)), `accepted: "... is now in West ${target.code}."`);
  check(await row(waiting.body.fullName).count().then((n) => n === 0), 'and they leave the waiting list');
  const accepted = await call<UserSummary>('GET', `/users/${waiting.body.id}`);
  check(accepted.body.room?.code === target.code, 'the server has the room');

  // ---- a bed that goes while the picker is open: refused by the server, shown in the picker ----
  const late = await makeStudent(`Smoke Late ${STAMP}`);
  await page.reload();
  await row(late.body.fullName).getByRole('button', { name: /^Accept/ }).click();
  const lateDialog = page.getByRole('dialog', { name: `Accept ${late.body.fullName}` });
  const room = await firstFreeRoom('CT3');
  await lateDialog.getByRole('searchbox').fill(room.code);
  await lateDialog.getByText(room.code, { exact: true }).click();
  for (let i = 0; i < room.beds - room.occupants; i++) await makeStudent(`Smoke Filler ${STAMP} ${i}`, room.code); // someone else fills it
  await lateDialog.getByRole('button', { name: `Assign ${room.code}` }).click();
  check(await seen(lateDialog.getByRole('alert').filter({ hasText: `Room ${room.code} is full` })), `the server refuses the bed that went meanwhile ("Room ${room.code} is full")`);
  check(await seen(lateDialog.getByText(`No room starting with ${room.code} has a free bed.`)), 'and the picker shows the rooms as they are now');
  check((await call<UserSummary>('GET', `/users/${late.body.id}`)).body.room === null, 'the student is still without a room');
  await lateDialog.getByRole('button', { name: 'Close' }).click();
  check((await call('PATCH', `/users/${late.body.id}`, { roomCode: full.code })).status === 409, 'the API refuses a full room directly too (409)');

  // ---- Add user ----
  await page.getByRole('link', { name: 'Add user' }).click();
  await page.waitForURL('**/admin/users/new');
  await page.getByRole('button', { name: 'Add user' }).click();
  check(await seen(page.getByText('Enter the full name')), 'Add: a name is required');
  check(await seen(page.getByText('Give an email or a mobile number')), 'Add: an email or a mobile number is required');
  const name = `Smoke Added ${STAMP}`;
  await page.getByLabel('Full name').fill(name);
  await page.getByLabel('Email').fill('arjun.rao@example.com');
  await page.getByRole('button', { name: 'Add user' }).click();
  check(await seen(page.getByText('This email is already in use')), 'Add: a used email is refused by the server (409)');
  await page.getByLabel('Email').fill(`smoke.added.${STAMP}@smoke.example.com`);
  await page.getByLabel('Mobile number').fill('12345');
  await page.getByRole('button', { name: 'Add user' }).click();
  check(await seen(page.getByText('Enter a valid 10-digit mobile number')), 'Add: a bad mobile number is caught');
  await page.getByLabel('Mobile number').fill('');
  check(await page.getByRole('checkbox', { name: /^Student/ }).isChecked(), 'Student is ticked by default');
  await page.getByRole('button', { name: 'Choose room' }).click();
  const pick = page.getByRole('dialog', { name: `Room for ${name}` });
  const addRoom = await firstFreeRoom('CF1');
  await pick.getByRole('searchbox').fill(addRoom.code);
  await pick.getByText(addRoom.code, { exact: true }).click();
  await pick.getByRole('button', { name: `Choose ${addRoom.code}` }).click();
  check(await seen(page.locator('main').getByText(addRoom.code, { exact: true })), `the chosen room ${addRoom.code} shows on the form`);
  await shot(page, 'add');
  await page.getByRole('button', { name: 'Add user' }).click();
  await page.waitForURL((u) => u.pathname === '/admin/users');
  check(await seen(page.getByText(`Added ${name} in West ${addRoom.code}.`)), 'Add: back to the list with "Added ... in West ..."');
  const added = (await call<{ items: UserSummary[] }>('GET', `/users?q=${encodeURIComponent(name)}`)).body.items[0];
  if (added) created.push(added.id);
  check(added?.room?.code === addRoom.code && added.roles.join() === 'student', 'the server has the new student in that room');

  // ---- Edit: roles and room ----
  await page.goto(`${BASE}/admin/users/${added!.id}`);
  await page.getByRole('heading', { level: 1, name }).waitFor();
  await page.getByLabel('Full name').fill(`${name} K`);
  await page.getByRole('checkbox', { name: /^Warden/ }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  check(await seen(page.getByText('Saved.')), 'Edit: saved');
  let now = (await call<UserSummary>('GET', `/users/${added!.id}`)).body;
  check(now.fullName === `${name} K` && now.roles.includes('warden') && now.roles.includes('student'), 'Edit: name and the second role are on the server');
  await page.getByRole('checkbox', { name: /^Student/ }).uncheck();
  check(await seen(page.getByText(`Saving takes them out of West ${addRoom.code}`)), 'Edit: removing Student warns about the room');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByText('Saved.').waitFor();
  now = (await call<UserSummary>('GET', `/users/${added!.id}`)).body;
  check(now.roles.join() === 'warden' && now.room === null, 'Edit: now a warden only, out of the room');
  await page.getByRole('button', { name: 'Save changes' }).click();
  check(await seen(page.getByText('Nothing to save.')), 'Edit: an unchanged form sends nothing');

  // ---- Disable / Enable ----
  await page.getByRole('button', { name: 'Disable user' }).click();
  const confirm = page.getByRole('dialog', { name: `Disable ${name} K?` });
  check(await seen(confirm), 'Disable asks first');
  await confirm.getByRole('button', { name: 'Disable' }).click();
  check(await seen(page.getByText(`${name} K is disabled and signed out everywhere.`)), 'Disabled');
  check((await call<UserSummary>('GET', `/users/${added!.id}`)).body.status === 'disabled', 'the server has it disabled');
  await page.getByRole('button', { name: 'Enable user' }).click();
  check(await seen(page.getByText(`${name} K can sign in again.`)), 'Enabled again');

  // ---- your own account ----
  const self = (await call<{ items: UserSummary[] }>('GET', '/users?q=rahul.verma')).body.items[0]!;
  await page.goto(`${BASE}/admin/users/${self.id}`);
  await page.getByRole('heading', { level: 1, name: 'Rahul Verma' }).waitFor();
  check(await page.getByRole('checkbox', { name: /^Admin/ }).isDisabled(), "your own roles can't be changed");
  check((await page.getByRole('button', { name: 'Disable user' }).count()) === 0 && (await seen(page.getByText("You can't disable your own account."))), "you can't disable yourself");

  // ---- CSV import ----
  await page.goto(`${BASE}/admin/users/import`);
  check((await page.getByRole('link', { name: 'Download template' }).getAttribute('href'))?.startsWith('data:text/csv') ?? false, 'a template can be downloaded');
  const csvRoom = await firstFreeRoom('CF1');
  const csv = [
    'fullName,email,phone,roles,roomCode,password',
    `Smoke Csv One ${STAMP},smoke.csv1.${STAMP}@smoke.example.com,,student,${csvRoom.code},`,
    `Smoke Csv Two ${STAMP},smoke.csv2.${STAMP}@smoke.example.com,,warden|student,,`,
    ',nameless@smoke.example.com,,student,,',
    `Smoke Csv Dup ${STAMP},arjun.rao@example.com,,student,,`,
  ].join('\n');
  await page.locator('input[type=file]').setInputFiles({ name: 'users.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
  check(await seen(page.getByText('3 ready')), 'Import: the preview counts 3 ready rows');
  check(await seen(page.getByText('Name: Enter the full name')), 'Import: the row without a name is flagged before sending');
  await shot(page, 'import-preview');
  await page.getByRole('button', { name: 'Import 3 users' }).click();
  check(await seen(page.getByText('Added 2 users. Skipped 2.')), 'Import: 2 added, 2 skipped');
  check(await seen(page.getByText('email: This email is already in use')), 'Import: the server reports the used email with its line');
  await shot(page, 'import-done');
  for (const n of ['One', 'Two']) {
    const u = (await call<{ items: UserSummary[] }>('GET', `/users?q=${encodeURIComponent(`Smoke Csv ${n} ${STAMP}`)}`)).body.items[0];
    if (u) created.push(u.id);
    check(!!u, `Import: "Smoke Csv ${n}" exists`);
    if (n === 'One') check(u?.room?.code === csvRoom.code, `Import: and is in ${csvRoom.code}`);
  }
  await page.getByRole('button', { name: 'Back to users' }).click();
  check(await seen(page.getByText('Imported 2 users.')), 'Import: back to the list with "Imported 2 users."');
  await ctx.close();

  // ---- phone width, dark ----
  {
    const { ctx: phone, page: p } = await signIn({ width: 360, height: 800 }, 'dark');
    await p.goto(`${BASE}/admin/users?view=students`);
    await p.locator('tbody tr').first().waitFor();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `phone: no sideways page scroll (${overflow} px)`);
    await shot(p, 'list-phone-dark');
    const someone = await makeStudent(`Smoke Phone ${STAMP}`);
    await p.goto(`${BASE}/admin/users?view=waiting&q=${encodeURIComponent(someone.body.fullName)}`);
    await p.getByRole('button', { name: /^Accept/ }).first().click();
    const d = p.getByRole('dialog');
    await d.getByRole('radio').first().waitFor({ state: 'attached' });
    const box = await d.boundingBox();
    check(!!box && box.width <= 360 && box.x >= 0, 'phone: the picker fits the screen');
    await shot(p, 'picker-phone-dark');
    await phone.close();
  }
} catch (err) {
  failures.push(String(err));
  console.log('FAIL', err);
} finally {
  // Tidy up: everyone this run created leaves their room and is disabled (a disabled user holds no bed).
  for (const id of created) await call('PATCH', `/users/${id}`, { roomCode: null, status: 'disabled' }).catch(() => undefined);
  if (created.length) console.log(`(tidied up ${created.length} users created by this run)`);
  await browser.close();
  stack.stop();
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exitCode = failures.length ? 1 : 0;
