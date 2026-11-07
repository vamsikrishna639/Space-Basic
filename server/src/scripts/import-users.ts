// Import users from a CSV file through the API (POST /api/v1/users/import). No admin screens in Phase 1.
//
//   npm run import-users -w server -- <file.csv> --accept-privacy-policy [--api http://localhost:4000/api/v1]
//
// The admin's credentials come from the environment, never from the command line or the file:
//   SB_ADMIN_EMAIL, SB_ADMIN_PASSWORD   (an institution_admin of the institution the users join)
// Signing in requires accepting the privacy policy, exactly as in the app, hence --accept-privacy-policy.
//
// CSV header (any order; only fullName and roles are required, plus email or phone):
//   fullName,email,phone,roles,roomCode,password
// roles: one or more of student, warden, institution_admin separated by "|" (e.g. "student" or "warden|student").
// password: optional initial password. Without it the user signs in with a one-time code.
import fs from 'node:fs';
import path from 'node:path';
import { CONSENT_POLICY_VERSION, CLIENT_HEADER, IMPORT_MAX_ROWS, type ImportUsersResult } from '@spacebasic/shared';
import { parseCsv, type CsvRecord } from './csv';

export const CSV_COLUMNS = ['fullName', 'email', 'phone', 'roles', 'roomCode', 'password'] as const;
const MAX_BATCH_BYTES = 90_000; // the API accepts JSON bodies up to 100 kB

/** CSV records -> API rows, keeping each row's CSV line number. Throws on a bad header. */
export function recordsToRows(records: CsvRecord[]): { line: number; row: Record<string, unknown> }[] {
  const [header, ...data] = records;
  if (!header) throw new Error('The CSV file is empty');
  const columns = header.fields.map((f) => f.trim());
  const unknown = columns.filter((c) => !(CSV_COLUMNS as readonly string[]).includes(c));
  if (unknown.length) throw new Error(`Unknown column(s): ${unknown.join(', ')}. Allowed: ${CSV_COLUMNS.join(', ')}`);
  for (const required of ['fullName', 'roles']) if (!columns.includes(required)) throw new Error(`Missing column: ${required}`);
  if (new Set(columns).size !== columns.length) throw new Error('A column appears twice in the header');

  return data.map((rec) => {
    const row: Record<string, unknown> = {};
    columns.forEach((col, i) => {
      const value = (rec.fields[i] ?? '').trim();
      row[col] = col === 'roles' ? value.split('|').map((r) => r.trim()).filter(Boolean) : value;
    });
    return { line: rec.line, row };
  });
}

/** Split rows into batches that respect both the row limit and the request-size limit. */
export function batches<T>(items: T[], maxRows = IMPORT_MAX_ROWS, maxBytes = MAX_BATCH_BYTES): T[][] {
  const out: T[][] = [];
  let current: T[] = [];
  let bytes = 20;
  for (const item of items) {
    const size = Buffer.byteLength(JSON.stringify(item)) + 1;
    if (current.length && (current.length >= maxRows || bytes + size > maxBytes)) { out.push(current); current = []; bytes = 20; }
    current.push(item);
    bytes += size;
  }
  if (current.length) out.push(current);
  return out;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== arg('--api'));
  const api = (arg('--api') ?? 'http://localhost:4000/api/v1').replace(/\/+$/, '');
  const { SB_ADMIN_EMAIL: email, SB_ADMIN_PASSWORD: password } = process.env;
  if (!file) throw new Error('Usage: npm run import-users -w server -- <file.csv> --accept-privacy-policy [--api <base url>]');
  if (!process.argv.includes('--accept-privacy-policy')) throw new Error('Signing in accepts the privacy policy. Re-run with --accept-privacy-policy.');
  if (!email || !password) throw new Error('Set SB_ADMIN_EMAIL and SB_ADMIN_PASSWORD in the environment (never on the command line).');

  const rows = recordsToRows(parseCsv(fs.readFileSync(path.resolve(file), 'utf8')));
  if (!rows.length) throw new Error('The CSV file has a header but no rows');
  console.log(`import: ${rows.length} row(s) from ${file} -> ${api}`);

  const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } }),
  });
  if (!login.ok) throw new Error(`Sign-in failed (${login.status}). Check SB_ADMIN_EMAIL / SB_ADMIN_PASSWORD.`);
  const { accessToken } = (await login.json()) as { accessToken: string };
  const cookie = login.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');

  let created = 0;
  const skipped: { line: number; reason: string }[] = [];
  try {
    for (const batch of batches(rows)) {
      const res = await fetch(`${api}/users/import`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}` },
        body: JSON.stringify({ users: batch.map((b) => b.row) }),
      });
      const body = (await res.json()) as ImportUsersResult & { error?: { message: string; fields?: Record<string, string> } };
      if (!res.ok) throw new Error(`Import failed (${res.status}): ${body.error?.message ?? 'unknown error'} ${JSON.stringify(body.error?.fields ?? {})}`);
      created += body.created;
      for (const s of body.skipped) skipped.push({ line: batch[s.row - 1]!.line, reason: s.reason });
    }
  } finally {
    // End the session the script opened (revokes the refresh token on the server).
    await fetch(`${api}/auth/logout`, { method: 'POST', headers: { [CLIENT_HEADER]: '1', cookie } }).catch(() => undefined);
  }

  console.log(`import: created ${created}, skipped ${skipped.length}`);
  for (const s of skipped) console.log(`  line ${s.line}: ${s.reason}`);
  if (skipped.length) process.exitCode = 2;
}

if (require.main === module) {
  main().catch((err) => { console.error('import failed:', err instanceof Error ? err.message : err); process.exit(1); });
}
