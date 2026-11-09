// Import users from a CSV file through the API (POST /api/v1/users/import). Admins can also import in the app
// (Admin > Users > Import CSV).
//
//   npm run import-users -w server -- <file.csv> --accept-privacy-policy [--api http://localhost:4000/api/v1]
//
// The admin's credentials are asked in the terminal (the password typed hidden), or read from the environment
// (SB_ADMIN_EMAIL, SB_ADMIN_PASSWORD); never from the command line or the file. Against production, pass the app's
// URL: --api https://<your-app>.vercel.app/api/v1 (README, "Deployment").
// Signing in requires accepting the privacy policy, exactly as in the app, hence --accept-privacy-policy.
//
// CSV header (any order; only fullName and roles are required, plus email or phone):
//   fullName,email,phone,roles,roomCode,password
// roles: one or more of student, warden, institution_admin separated by "|" (e.g. "student" or "warden|student").
// password: initial password. Without it the user can only sign in with a one-time code, which needs OTP_PROVIDER
// (off in production for now, so give every production user a password).
import fs from 'node:fs';
import path from 'node:path';
import { batches, CONSENT_POLICY_VERSION, CLIENT_HEADER, parseCsv, recordsToRows, type ImportUsersResult } from '@spacebasic/shared';
import { ask, askHidden } from './prompt';

// The parser, the column rules and the batching live in shared/src/csv.ts: the admin Users screen imports a file
// the same way in the browser.

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const file = process.argv.slice(2).find((a) => !a.startsWith('--') && a !== arg('--api'));
  const api = (arg('--api') ?? 'http://localhost:4000/api/v1').replace(/\/+$/, '');
  if (!file) throw new Error('Usage: npm run import-users -w server -- <file.csv> --accept-privacy-policy [--api <base url>]');
  if (!process.argv.includes('--accept-privacy-policy')) throw new Error('Signing in accepts the privacy policy. Re-run with --accept-privacy-policy.');

  const rows = recordsToRows(parseCsv(fs.readFileSync(path.resolve(file), 'utf8')));
  if (!rows.length) throw new Error('The CSV file has a header but no rows');
  console.log(`import: ${rows.length} row(s) from ${file} -> ${api}`);
  const email = process.env.SB_ADMIN_EMAIL?.trim() || (await ask('Admin email'));
  const password = process.env.SB_ADMIN_PASSWORD || (await askHidden('Admin password (typed hidden)'));
  if (!email || !password) throw new Error('An admin email and password are needed to sign in.');

  const login = await fetch(`${api}/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email, password, consent: { accepted: true, policyVersion: CONSENT_POLICY_VERSION } }),
  });
  if (!login.ok) throw new Error(`Sign-in failed (${login.status}). Check the admin email and password${login.status === 502 || login.status === 504 ? ' (or the API is still waking up: try again in a minute)' : ''}.`);
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
  main().then(() => process.exit(process.exitCode ?? 0), (err) => { console.error('import failed:', err instanceof Error ? err.message : err); process.exit(1); });
}
