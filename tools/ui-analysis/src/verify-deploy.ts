// Deployment rehearsal from a clean copy (docs/decisions.md 2026-11-09, README "Deployment"):
//   1. copies exactly what git would commit (tracked + new files, minus .gitignore) into two empty folders;
//   2. runs Render's build (render.yaml, NODE_ENV=production) in one and Vercel's install + build (vercel.json) in
//      the other, with the commands read from those files, so what is checked is what the hosts will run;
//   3. checks the API refuses to start in production without its secrets, then starts it in production mode
//      against a throwaway MongoDB, bootstraps the first admin with `create-admin` (no seed data), and checks
//      health, sign-in, the cookie flags, the Origin check, production rate limits and the room layout;
//   4. serves client/dist with vercel.json's rewrites and headers (an emulation: /api is piped to the API and the
//      page is presented to it as https://verify.example) and signs in through Chromium, including a reload.
// Needs free ports 4100 and 4180. Nothing touches the dev database or any real one.
//
//   node tools/ui-analysis/src/verify-deploy.ts [--keep]
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { chromium } from 'playwright';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const WORK = path.join(os.tmpdir(), `sb-verify-${Date.now().toString(36)}`);
const API_PORT = 4100;
const WEB_PORT = 4180;
const ORIGIN = 'https://verify.example';
const API = `http://127.0.0.1:${API_PORT}/api/v1`;

const failures: string[] = [];
const check = (ok: boolean, what: string) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failures.push(what); };
const step = (s: string) => console.log(`\n== ${s}`);

// ---- what the hosts run ------------------------------------------------------------------------------------
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')) as {
  installCommand: string; buildCommand: string; outputDirectory: string;
  rewrites: { source: string; destination: string }[]; headers: { source: string; headers: { key: string; value: string }[] }[];
};
const renderYaml = fs.readFileSync(path.join(ROOT, 'render.yaml'), 'utf8');
const yamlValue = (key: string) => {
  const m = new RegExp(`^\\s*${key}:\\s*(.+)$`, 'm').exec(renderYaml);
  if (!m) throw new Error(`render.yaml has no ${key}`);
  return m[1]!.trim();
};
const render = { build: yamlValue('buildCommand'), start: yamlValue('startCommand'), health: yamlValue('healthCheckPath') };

// A clean environment: nothing from this machine's own configuration leaks into the builds.
const baseEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) =>
  !/^(MONGODB_URI|JWT_|QR_|OTP_|APP_ORIGINS|COOKIE_|TRUST_PROXY|CLIENT_IP_HEADER|RELAX_|ALLOW_CONSOLE|GMAIL_|SB_|NODE_ENV|PORT)/.test(k)));
const shell = process.platform === 'win32' ? 'bash' : 'sh';

function run(cmd: string, cwd: string, env: NodeJS.ProcessEnv, input?: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn(shell, ['-c', cmd], { cwd, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (d: Buffer) => { out += d; });
    child.stderr.on('data', (d: Buffer) => { out += d; });
    if (input !== undefined) child.stdin.end(input); else child.stdin.end();
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}
const tail = (s: string, n = 15) => s.trim().split('\n').slice(-n).join('\n');
const kill = (c: ChildProcess | null) => {
  if (!c?.pid) return;
  if (process.platform === 'win32') { try { execSync(`taskkill /PID ${c.pid} /T /F`, { stdio: 'ignore' }); } catch { /* gone */ } } else c.kill('SIGTERM');
};
const portBusy = (port: number) => new Promise<boolean>((resolve) => {
  const probe = http.get({ host: '127.0.0.1', port, path: '/', timeout: 1000 }, (r) => { r.resume(); resolve(true); });
  probe.on('error', () => resolve(false));
  probe.on('timeout', () => { probe.destroy(); resolve(true); });
});
/** Backstop: end whatever still listens on `port` (on Windows a killed shell can leave its node child running). */
function freePort(port: number) {
  if (process.platform !== 'win32') return;
  try {
    execSync(`powershell -NoProfile -Command "Get-NetTCPConnection -State Listen -LocalPort ${port} -ErrorAction SilentlyContinue | ForEach-Object { taskkill /PID $_.OwningProcess /T /F }"`, { stdio: 'ignore' });
  } catch { /* nothing there */ }
}

// ---- 1. a clean copy ---------------------------------------------------------------------------------------
function cleanCopy(dest: string): number {
  const files = execSync('git ls-files -z --cached --others --exclude-standard', { cwd: ROOT }).toString().split('\0').filter(Boolean);
  let n = 0;
  for (const f of files) {
    const from = path.join(ROOT, f);
    if (!fs.existsSync(from) || fs.statSync(from).isDirectory()) continue; // deleted in the working tree
    fs.mkdirSync(path.dirname(path.join(dest, f)), { recursive: true });
    fs.copyFileSync(from, path.join(dest, f));
    n++;
  }
  return n;
}

let api: ChildProcess | null = null;
let web: http.Server | null = null;
let mongo: MongoMemoryServer | null = null;

try {
  for (const port of [API_PORT, WEB_PORT]) if (await portBusy(port)) throw new Error(`Port ${port} is in use: stop whatever runs there first.`);
  step(`clean copies in ${WORK}`);
  const renderDir = path.join(WORK, 'render');
  const vercelDir = path.join(WORK, 'vercel');
  const copied = cleanCopy(renderDir);
  cleanCopy(vercelDir);
  check(copied > 100 && !fs.existsSync(path.join(renderDir, 'node_modules')) && !fs.existsSync(path.join(renderDir, 'server/.data')), `${copied} files copied (no node_modules, dist, .env or .data)`);
  check(!fs.readdirSync(renderDir, { recursive: true }).some((f) => /(^|[\\/])\.env($|\.(?!example))/.test(String(f))), 'no .env file in the copy');

  // ---- 2. builds ----
  step(`Render build: ${render.build}`);
  const rb = await run(render.build, renderDir, { ...baseEnv, NODE_ENV: 'production' });
  check(rb.code === 0, 'Render build succeeds with NODE_ENV=production');
  if (rb.code !== 0) console.log(tail(rb.out, 30));
  check(fs.existsSync(path.join(renderDir, 'server/dist/server.js')) && fs.existsSync(path.join(renderDir, 'shared/dist/index.js')), 'server/dist and shared/dist built');

  step(`Vercel install + build: ${vercel.installCommand} && ${vercel.buildCommand}`);
  const vb = await run(`${vercel.installCommand} && ${vercel.buildCommand}`, vercelDir, { ...baseEnv, VERCEL: '1', CI: '1', VERCEL_GIT_COMMIT_SHA: 'deadbeefverify00' });
  check(vb.code === 0, 'Vercel build succeeds');
  if (vb.code !== 0) console.log(tail(vb.out, 30));
  const dist = path.join(vercelDir, vercel.outputDirectory);
  check(fs.existsSync(path.join(dist, 'index.html')), `${vercel.outputDirectory}/index.html exists`);
  const builtJs = fs.readdirSync(path.join(dist, 'assets')).filter((f) => f.endsWith('.js')).map((f) => fs.readFileSync(path.join(dist, 'assets', f), 'utf8')).join('\n');
  check(builtJs.includes('deadbeef'), 'the build stamp uses VERCEL_GIT_COMMIT_SHA');
  check(!/mongodb\+srv|JWT_ACCESS_SECRET|OTP_PEPPER/.test(builtJs), 'no server secrets or connection strings in the client bundle');

  // ---- 3. the API in production mode ----
  step(`API start: ${render.start}`);
  const bare = await run(render.start, renderDir, { ...baseEnv, NODE_ENV: 'production', PORT: String(API_PORT) });
  check(bare.code !== 0 && /MONGODB_URI is required in production/.test(bare.out) && /JWT_ACCESS_SECRET must be set/.test(bare.out),
    'without its variables the API refuses to start and names them');

  mongo = await MongoMemoryServer.create();
  const uri = `${mongo.getUri()}spacebasic`;
  const secret = () => crypto.randomBytes(32).toString('base64url');
  const prodEnv = {
    ...baseEnv, NODE_ENV: 'production', PORT: String(API_PORT), MONGODB_URI: uri,
    JWT_ACCESS_SECRET: secret(), QR_TOKEN_SECRET: secret(), OTP_PEPPER: secret(),
    APP_ORIGINS: ORIGIN, COOKIE_SECURE: 'true', TRUST_PROXY: '1', CLIENT_IP_HEADER: 'x-vercel-forwarded-for',
  };
  let apiLog = '';
  // The start command has no shell syntax: run it through the platform shell (cmd on Windows, whose process tree
  // taskkill /T follows; a Git Bash parent can leave the node child running).
  api = spawn(render.start, { cwd: renderDir, env: prodEnv, stdio: ['ignore', 'pipe', 'pipe'], shell: true });
  api.stdout!.on('data', (d: Buffer) => { apiLog += d; });
  api.stderr!.on('data', (d: Buffer) => { apiLog += d; });
  const healthUrl = `http://127.0.0.1:${API_PORT}${render.health}`;
  let healthy = false;
  for (let i = 0; i < 120 && !healthy; i++) {
    try { healthy = (await fetch(healthUrl)).ok; } catch { /* starting */ }
    if (!healthy) await new Promise((r) => setTimeout(r, 500));
  }
  check(healthy, `health check ${render.health} answers 200`);
  if (!healthy) throw new Error(`API did not start:\n${tail(apiLog)}`);
  check(/OTP provider for email = none/.test(apiLog), 'one-time codes are off (email + password only)');
  check(!/seed:/.test(apiLog), 'no seed data in production');

  step('first admin with create-admin (answers piped in, as a person would type them)');
  const adminPassword = `Verify-${secret().slice(0, 12)}`;
  const answers = ['Presidency University', 'Asia/Kolkata', 'Verify Admin', 'verify.admin@example.com', '', adminPassword, adminPassword].join('\n') + '\n';
  const ca = await run('npm run create-admin -w server -- --layout --logo ../reference-ui/assets/logo-presidency.png', renderDir, { ...baseEnv, MONGODB_URI: uri }, answers);
  check(ca.code === 0 && /create-admin: done/.test(ca.out), 'create-admin creates the institution, the admin, the logo and the layout');
  if (ca.code !== 0) console.log(tail(ca.out));
  check(!ca.out.includes(adminPassword), 'the password is never printed');
  // A second run: the institution exists now, so the time zone isn't asked.
  const secondAnswers = ['Presidency University', 'Second Admin', 'verify.admin@example.com', '', adminPassword, adminPassword].join('\n') + '\n';
  const again = await run('npm run create-admin -w server', renderDir, { ...baseEnv, MONGODB_URI: uri }, secondAnswers);
  check(again.code !== 0 && /already in use/.test(again.out), 'running it again with the same email is refused');

  step('API checks (production mode)');
  const login = await fetch(`${API}/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json', origin: ORIGIN },
    body: JSON.stringify({ email: 'verify.admin@example.com', password: adminPassword, consent: { accepted: true, policyVersion: (await (await fetch(`${API}/consent/policy`)).json() as { policyVersion: string }).policyVersion } }),
  });
  check(login.status === 200, 'the admin signs in');
  const cookie = login.headers.getSetCookie().find((c) => c.startsWith('sb_rt=')) ?? '';
  check(/;\s*Secure/i.test(cookie) && /HttpOnly/i.test(cookie) && /SameSite=Lax/i.test(cookie) && /Path=\/api\/v1\/auth/i.test(cookie), 'refresh cookie: Secure, HttpOnly, SameSite=Lax, Path=/api/v1/auth');
  check(/\b20-in-15min\b/.test(login.headers.get('ratelimit-policy') ?? ''), 'production sign-in limit (20 per 15 min per address), not relaxed');
  const { accessToken } = (await login.json()) as { accessToken: string };
  const authed = (p: string) => fetch(`${API}${p}`, { headers: { authorization: `Bearer ${accessToken}` } }).then((r) => r.json());
  const me = (await authed('/users/me')) as { roles: string[]; institution: { name: string; logoUrl: string | null } };
  check(me.roles.join() === 'institution_admin' && me.institution.name === 'Presidency University' && !!me.institution.logoUrl, '/users/me: admin of Presidency University, with the logo');
  const users = (await authed('/users')) as { items: unknown[] };
  check(users.items.length === 1, 'the only user is the new admin (no fake users)');
  const rooms = (await authed('/hostel/rooms?free=true&q=CT40')) as { items: { code: string }[] };
  check(rooms.items.map((r) => r.code).join() === 'CT400', 'the placeholder layout exists (CT400 is free)');
  const refresh = (origin: string) => fetch(`${API}/auth/refresh`, { method: 'POST', headers: { cookie: cookie.split(';')[0]!, origin, 'x-sb-client': '1' } });
  check((await refresh('https://evil.example')).status === 403, 'refresh from another site is refused (Origin check)');
  check((await refresh(ORIGIN)).status === 200, 'refresh from the app works');

  // ---- 4. the client with vercel.json's routing ----
  step(`client on http://localhost:${WEB_PORT} with vercel.json routing`);
  const toRegex = (src: string) => new RegExp(`^${src.replace(/:path\*/, '(.*)')}$`);
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.map': 'application/json', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  web = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x');
    for (const rule of vercel.headers) if (toRegex(rule.source).test(url.pathname)) for (const h of rule.headers) res.setHeader(h.key, h.value);
    const apiRule = vercel.rewrites.find((r) => r.source.startsWith('/api'));
    if (apiRule && toRegex(apiRule.source).test(url.pathname)) {
      // Vercel's rewrite -> Render. The page is presented as the deployed https origin (APP_ORIGINS). As measured on
      // the real deployment, a visitor's own X-Forwarded-For passes through (here a made-up one), no x-real-ip arrives,
      // and Vercel overwrites x-vercel-forwarded-for with the visitor's address (here the visitor's "real" address).
      const { 'x-real-ip': _dropped, ...incoming } = req.headers;
      const headers = { ...incoming, host: `127.0.0.1:${API_PORT}`, ...(req.headers.origin ? { origin: ORIGIN } : {}), 'x-forwarded-for': '198.51.100.66', 'x-vercel-forwarded-for': '203.0.113.9' };
      const up = http.request({ host: '127.0.0.1', port: API_PORT, path: url.pathname + url.search, method: req.method, headers }, (r) => { res.writeHead(r.statusCode ?? 502, r.headers); r.pipe(res); });
      // The API may stop while a request is in flight (teardown): answer 502 if nothing was sent yet, else just close.
      up.on('error', () => { if (res.headersSent) res.destroy(); else { res.writeHead(502); res.end(); } });
      req.pipe(up);
      return;
    }
    const file = path.join(dist, decodeURIComponent(url.pathname));
    const target = file.startsWith(dist) && fs.existsSync(file) && fs.statSync(file).isFile() ? file : path.join(dist, 'index.html');
    res.writeHead(200, { 'content-type': types[path.extname(target)] ?? 'application/octet-stream' });
    fs.createReadStream(target).pipe(res);
  }).listen(WEB_PORT);

  const browser = await chromium.launch();
  try {
    const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    const authLog: string[] = [];
    page.on('response', (r) => { if (r.url().includes('/api/v1/auth/')) authLog.push(`${r.request().method()} ${new URL(r.url()).pathname} ${r.status()}`); });
    const welcome = await page.goto(`http://localhost:${WEB_PORT}/`);
    check(welcome?.headers()['x-frame-options'] === 'DENY', 'vercel.json security headers are applied');
    check(await page.getByText('Seamless campus living.').waitFor({ timeout: 10_000 }).then(() => true, () => false), 'Welcome renders from the built bundle');
    check(await page.locator('img').first().evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0), 'the logo image loads');
    const deep = await page.goto(`http://localhost:${WEB_PORT}/admin/users`);
    check(deep?.status() === 200, 'a deep link is served the app (SPA fallback)');
    await page.waitForURL((u) => u.pathname === '/', { timeout: 10_000 }).catch(() => undefined);
    check(new URL(page.url()).pathname === '/', 'signed out, the deep link goes to Welcome');
    await page.goto(`http://localhost:${WEB_PORT}/sign-in/email`);
    await page.getByPlaceholder('name@college.edu').fill('verify.admin@example.com');
    await page.getByPlaceholder('Enter your password').fill(adminPassword);
    await page.getByRole('checkbox').check();
    await page.getByRole('button', { name: 'Log in' }).click();
    await page.waitForURL('**/admin', { timeout: 15_000 }).catch(() => undefined);
    check(new URL(page.url()).pathname === '/admin', 'signing in through the built app lands on /admin');
    const cookies = await ctx.cookies();
    console.log(`     (cookies after sign-in: ${cookies.map((c) => `${c.name} path=${c.path} secure=${c.secure}`).join('; ') || 'none'})`);
    await page.goto(`http://localhost:${WEB_PORT}/admin/users`);
    check(await page.getByRole('link', { name: 'Verify Admin', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false), 'Admin > Users lists the admin (through the /api rewrite)');
    await page.screenshot({ path: fileURLToPath(new URL('../out/verify-users.png', import.meta.url)) });
    await page.reload();
    check(await page.getByRole('link', { name: 'Verify Admin', exact: true }).waitFor({ timeout: 10_000 }).then(() => true, () => false), 'a reload stays signed in (the refresh cookie works through the rewrite)');
    console.log(`     (auth responses: ${authLog.join(', ')})`);
    const client = (await page.evaluate(() => fetch('/api/v1/health/client').then((r) => r.json()))) as { ip: string; ipFrom: string };
    check(client.ip === '203.0.113.9' && client.ipFrom === 'x-vercel-forwarded-for', `CLIENT_IP_HEADER: the API uses x-vercel-forwarded-for, not a made-up X-Forwarded-For (${client.ip}, from ${client.ipFrom})`);
  } finally {
    await browser.close();
  }
} catch (err) {
  failures.push(String(err));
  console.log('FAIL', err);
} finally {
  kill(api);
  freePort(API_PORT);
  web?.close();
  await mongo?.stop();
  if (!process.argv.includes('--keep')) {
    // Windows may hold a file of the stopped API for a moment.
    try { fs.rmSync(WORK, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 }); } catch { console.log(`(could not remove ${WORK} yet; delete it later)`); }
  } else console.log(`(kept ${WORK})`);
}

console.log(failures.length ? `\n${failures.length} failed` : '\nall passed');
process.exitCode = failures.length ? 1 : 0;
