// Functional smoke test of Admin > Hostel (FREE DESIGN: no visual diff; docs/decisions.md 2026-11-09): add rooms by
// range with the preview (a new floor, then a wider range that skips existing rooms), search, change a room's beds,
// remove a range (blocked while a student is assigned, listing who), delete one room, Accept a waiting student
// into one of the new rooms from Admin > Users, delete the emptied floor, and a phone-width pass. It works on its
// own floor with an unused two-letter prefix and removes it at the end, so the seeded FAKE data stays as it is.
// Uses a running dev stack or starts one (dev-stack.ts). Screenshots: tools/ui-analysis/out/hostel-*.png (gitignored).
//
//   node tools/ui-analysis/src/smoke-hostel.ts
import { fileURLToPath } from 'node:url';
import { chromium, type Browser, type Locator, type Page } from 'playwright';
import { CLIENT as BASE, devStack } from './dev-stack.ts';

const API = 'http://127.0.0.1:4000/api/v1';
const OUT = new URL('../out/', import.meta.url);
const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const shot = (p: Page, name: string) => p.screenshot({ path: fileURLToPath(new URL(`hostel-${name}.png`, OUT)), fullPage: true });
const seen = (l: Locator, timeout = 8_000) => l.first().waitFor({ timeout }).then(() => true, () => false);

const STAMP = Date.now().toString(36).slice(-6);
const created: string[] = [];
let prefix = '';

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
  const policy = (await (await fetch(`${API}/consent/policy`)).json()) as { policyVersion: string };
  const res = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'rahul.verma@example.com', password: 'Admin@2026', consent: { accepted: true, policyVersion: policy.policyVersion } }),
  });
  if (!res.ok) throw new Error(`API sign-in failed: ${res.status}`);
  token = ((await res.json()) as { accessToken: string }).accessToken;
}
async function makeStudent(name: string, roomCode?: string) {
  const r = await call<{ id: string; fullName: string }>('POST', '/users', {
    fullName: name, email: `${name.toLowerCase().replace(/\s+/g, '.')}@smoke.example.com`, roles: ['student'], ...(roomCode ? { roomCode } : {}),
  });
  if (r.status === 201) created.push(r.body.id);
  return r;
}

const stack = await devStack({ reuse: true });
const browser: Browser = await chromium.launch();

async function signIn(viewport = { width: 1280, height: 900 }, colorScheme: 'dark' | 'light' = 'light') {
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
  // An unused prefix for this run's own floor.
  type Structure = { hostel: { name: string; code: string }; floors: { code: string }[] }[];
  const used = new Set((await call<Structure>('GET', '/hostel/structure')).body.flatMap((h) => h.floors.map((f) => f.code)));
  prefix = [...'QRSTUVWXYZ'].map((c) => `Z${c}`).find((c) => !used.has(c))!;
  const floorName = `Smoke floor ${STAMP}`;

  const { ctx, page } = await signIn();
  await page.getByRole('navigation', { name: 'Admin sections' }).getByRole('link', { name: 'Hostel' }).click();
  await page.waitForURL('**/admin/hostel');
  check(await seen(page.getByRole('button', { name: /First floor · CF101–CF200/ })), 'the seeded floors are listed with their ranges');
  check(await seen(page.getByLabel('Totals').getByText(/rooms$/)), 'totals are shown');
  check(await seen(page.getByRole('listitem').filter({ hasText: 'CF101' })), 'the first floor\'s rooms are shown');
  await shot(page, 'floor-desktop');

  // ---- add rooms: a new floor ----
  await page.getByRole('button', { name: 'Add rooms', exact: true }).click();
  let d = page.getByRole('dialog', { name: 'Add rooms' });
  await d.getByLabel('Floor', { exact: true }).selectOption('');
  await d.getByLabel('Floor name').fill(floorName);
  await d.getByLabel('Room prefix').fill(prefix.toLowerCase());
  await d.getByLabel('First number').fill('101');
  await d.getByLabel('Last number').fill('99');
  check(await seen(d.getByText('Must be at least the first room number')), 'a backwards range is flagged before anything is sent');
  await d.getByLabel('Last number').fill('110');
  check(await seen(d.getByText(`Creates 10 rooms, ${prefix}101–${prefix}110, with 30 beds.`)), 'the preview shows the rooms and beds to be created');
  check(await seen(d.getByText(`New floor: ${floorName}`)), 'and that the floor is new');
  await shot(page, 'add-preview');
  await d.getByRole('button', { name: 'Create 10 rooms' }).click();
  check(await seen(page.getByText(`Created 10 rooms on ${floorName}: ${prefix}101–${prefix}110.`)), 'created; the notice says what');
  check(await seen(page.getByRole('button', { name: new RegExp(`${floorName} · ${prefix}101–${prefix}110`), pressed: true })), 'the new floor is selected');
  const tenShown = await page.waitForFunction((p) => {
    const tiles = [...document.querySelectorAll('ul[aria-label="Rooms"] li')];
    return tiles.length === 10 && tiles.every((t) => t.textContent?.startsWith(p));
  }, prefix, { timeout: 8_000 }).then(() => true, () => false);
  check(tenShown, 'its 10 rooms are shown');

  // ---- add rooms here: a wider range skips the existing ones ----
  await page.getByRole('button', { name: 'Add rooms here' }).click();
  d = page.getByRole('dialog', { name: 'Add rooms' });
  check((await d.getByLabel('First number').inputValue()) === '111', 'adding to a floor starts after its last room');
  await d.getByLabel('First number').fill('105');
  await d.getByLabel('Last number').fill('112');
  check(await seen(d.getByText(`Creates 2 rooms, ${prefix}111–${prefix}112, with 6 beds.`)), 'preview: only the 2 new rooms');
  check(await seen(d.getByText(`6 rooms already exist and stay as they are: ${prefix}105–${prefix}110.`)), 'preview: the 6 existing ones are skipped');
  await d.getByRole('button', { name: 'Create 2 rooms' }).click();
  check(await seen(page.getByText(`Created 2 rooms on ${floorName}: ${prefix}111–${prefix}112 (6 rooms already existed).`)), 'created the 2');

  // ---- search ----
  await page.getByRole('searchbox', { name: /Find a room/ }).fill(`${prefix.toLowerCase()}10`);
  check(await seen(page.getByRole('heading', { name: `Rooms starting with ${prefix}10` })), 'search by the start of a room code');
  await page.waitForFunction(() => document.querySelectorAll('ul[aria-label="Rooms"] li').length === 9);
  check((await page.getByRole('list', { name: 'Rooms' }).getByRole('listitem').count()) === 9, `9 rooms start with ${prefix}10`);

  // ---- beds ----
  await page.getByRole('button', { name: `Change the beds in ${prefix}101` }).click();
  d = page.getByRole('dialog', { name: `Beds in ${prefix}101` });
  await d.getByLabel('Beds').fill('2');
  await d.getByRole('button', { name: 'Save' }).click();
  check(await seen(page.getByText(`${prefix}101 now has 2 beds.`)), 'a room\'s bed count changes');
  check((await call<{ items: { beds: number }[] }>('GET', `/hostel/rooms?q=${prefix}101`)).body.items[0]?.beds === 2, 'the server has 2 beds');

  const resident = await makeStudent(`Smoke Resident ${STAMP}`, `${prefix}101`);
  await makeStudent(`Smoke Second ${STAMP}`, `${prefix}101`);
  await page.reload();
  await page.getByRole('button', { name: `Change the beds in ${prefix}101` }).click();
  d = page.getByRole('dialog', { name: `Beds in ${prefix}101` });
  check(await seen(d.getByText('2 beds are taken now, so at least 2.')), 'the beds dialog says how many are taken');
  await d.getByLabel('Beds').fill('1');
  await d.getByRole('button', { name: 'Save' }).click();
  check(await seen(d.getByText(/At least 2/)), 'fewer beds than are taken is refused');
  await d.getByRole('button', { name: 'Cancel' }).click();

  // ---- remove a range: blocked while someone is assigned ----
  await page.getByRole('searchbox', { name: /Find a room/ }).fill('');
  await page.getByRole('button', { name: new RegExp(floorName) }).click();
  await page.getByRole('button', { name: 'Remove rooms' }).click();
  d = page.getByRole('dialog', { name: `Remove rooms from ${floorName}` });
  await d.getByLabel('First number').fill('101');
  await d.getByLabel('Last number').fill('104');
  check(await seen(d.getByText(`Room ${prefix}101 has someone assigned.`)), 'removing a room with students is blocked');
  check(await seen(d.getByRole('link', { name: resident.body.fullName })), 'and lists who, with a link to their page');
  check(await d.getByRole('button', { name: /Remove/ }).isDisabled(), 'the Remove button is off');
  await shot(page, 'remove-blocked');
  await d.getByLabel('First number').fill('109');
  await d.getByLabel('Last number').fill('112');
  check(await seen(d.getByText(`Removes 4 rooms: ${prefix}109–${prefix}112. Nobody is assigned to them.`)), 'an empty range can go');
  await d.getByRole('button', { name: 'Remove 4 rooms' }).click();
  await d.getByRole('button', { name: 'Yes, remove 4 rooms' }).click();
  check(await seen(page.getByText(`Removed 4 rooms: ${prefix}109–${prefix}112.`)), 'the range was removed (after a second confirmation)');
  check(await seen(page.getByRole('button', { name: new RegExp(`${floorName} · ${prefix}101–${prefix}108`) })), 'the floor\'s range shrank');

  // ---- delete one room ----
  await page.getByRole('button', { name: `Delete room ${prefix}101` }).click();
  d = page.getByRole('dialog', { name: `Delete room ${prefix}101?` });
  check(await seen(d.getByRole('link', { name: resident.body.fullName })), 'deleting an occupied room shows who is in it');
  await d.getByRole('button', { name: 'Close' }).last().click(); // the footer one (the X is also "Close")
  await page.getByRole('button', { name: `Delete room ${prefix}102` }).click();
  d = page.getByRole('dialog', { name: `Delete room ${prefix}102?` });
  await d.getByRole('button', { name: 'Delete room' }).click();
  check(await seen(page.getByText(`Deleted room ${prefix}102.`)), 'an empty room is deleted');

  // ---- Accept into a new room from Admin > Users ----
  const waiting = await makeStudent(`Smoke Waiting ${STAMP}`);
  await page.goto(`${BASE}/admin/users?view=waiting&q=${encodeURIComponent(waiting.body.fullName)}`);
  await page.getByRole('button', { name: `Accept ${waiting.body.fullName} and assign a room` }).click();
  d = page.getByRole('dialog');
  await d.getByRole('searchbox', { name: 'Search rooms by code' }).fill(`${prefix}103`);
  const option = d.locator('label').filter({ hasText: `${prefix}103` });
  check(await seen(option.getByText('3 of 3 beds free')), `the picker offers ${prefix}103 with "3 of 3 beds free"`);
  await option.click();
  await d.getByRole('button', { name: `Assign ${prefix}103` }).click();
  check(await seen(page.getByText(`${waiting.body.fullName} is now in West ${prefix}103.`)), 'Accept puts the student in the new room');

  // ---- tidy the floor, then delete it from the screen ----
  for (const id of created) await call('PATCH', `/users/${id}`, { roomCode: null, status: 'disabled' });
  const gone = await call<{ deleted: string[] }>('POST', '/hostel/rooms/range/delete', { floorCode: prefix, from: 101, to: 600 });
  check(gone.status === 200, `the API removed the rest of the floor (${gone.body.deleted?.length ?? 0} rooms)`);
  await page.goto(`${BASE}/admin/hostel?floor=${prefix}`);
  await page.getByRole('button', { name: 'Delete floor' }).click();
  await page.getByRole('dialog', { name: `Delete ${floorName}?` }).getByRole('button', { name: 'Delete floor' }).click();
  check(await seen(page.getByText(`Deleted ${floorName}.`)), 'an empty floor is deleted');
  check(!(await call<Structure>('GET', '/hostel/structure')).body.some((h) => h.floors.some((f) => f.code === prefix)), 'the floor is gone on the server');
  prefix = '';
  await ctx.close();

  // ---- phone width, dark ----
  {
    const { ctx: phone, page: p } = await signIn({ width: 360, height: 800 }, 'dark');
    await p.goto(`${BASE}/admin/hostel`);
    await p.getByRole('list', { name: 'Rooms' }).getByRole('listitem').first().waitFor();
    const overflow = await p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check(overflow <= 0, `phone: no sideways page scroll (${overflow} px)`);
    await p.screenshot({ path: fileURLToPath(new URL('hostel-phone-dark.png', OUT)) });
    await p.getByRole('button', { name: 'Add rooms', exact: true }).click();
    const box = await p.getByRole('dialog', { name: 'Add rooms' }).boundingBox();
    check(!!box && box.width <= 360 && box.x >= 0, 'phone: the Add rooms dialog fits the screen');
    await p.screenshot({ path: fileURLToPath(new URL('hostel-add-phone-dark.png', OUT)) });
    await phone.close();
  }
} catch (err) {
  failures.push(String(err));
  console.log('FAIL', err);
} finally {
  for (const id of created) await call('PATCH', `/users/${id}`, { roomCode: null, status: 'disabled' }).catch(() => undefined);
  if (prefix) {
    await call('POST', '/hostel/rooms/range/delete', { floorCode: prefix, from: 1, to: 500 }).catch(() => undefined);
    await call('DELETE', `/hostel/floors/${prefix}`).catch(() => undefined);
  }
  if (created.length) console.log(`(tidied up ${created.length} users created by this run)`);
  await browser.close();
  stack.stop();
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exitCode = failures.length ? 1 : 0;
