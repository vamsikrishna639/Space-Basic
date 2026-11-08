// Starts the dev stack for a smoke script, with the sign-in and code rate limits relaxed (RELAX_RATE_LIMITS=true,
// development only: docs/decisions.md 2026-11-09), so repeated runs don't lock themselves out.
//
// `reuse: true`: if an API is already up on :4000, use it and report whether its limits are relaxed (read from the
// RateLimit-Policy header of one refused sign-in request). Otherwise start `node scripts/dev.mjs --relax-rate-limits`
// and stop it (the whole process tree) when the script ends.
import { spawn, execSync, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('../../..', import.meta.url));
const API = 'http://127.0.0.1:4000/api/v1';
export const CLIENT = 'http://localhost:5173';

export interface DevStack {
  reused: boolean;
  /** Whether the API runs with relaxed sign-in limits (always true when started here). */
  relaxed: boolean;
  /** Everything the stack printed (empty when reused). */
  log: () => string;
  stop: () => void;
}

const up = async (url: string) => { try { return (await fetch(url)).ok; } catch { return false; } };

async function until(what: string, fn: () => Promise<boolean>, ms = 120_000) {
  const end = Date.now() + ms;
  while (!(await fn())) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 250));
  }
}

/** One sign-in request with an empty body: refused by validation (400) after the limiter has counted it. */
async function limitsRelaxed(): Promise<boolean> {
  const res = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  const m = /"(\d+)-in-15min"/.exec(res.headers.get('ratelimit-policy') ?? ''); // the per-IP sign-in limit
  return !!m && Number(m[1]) > 20;
}

export async function devStack(opts: { reuse: boolean; onLine?: (line: string) => void }): Promise<DevStack> {
  if (opts.reuse && (await up(`${API}/health`))) {
    const relaxed = await limitsRelaxed();
    console.log(`(reusing the running dev stack; sign-in limits ${relaxed ? 'relaxed' : 'NOT relaxed: start it with `npm run dev:relaxed` for repeated runs'})`);
    return { reused: true, relaxed, log: () => '', stop: () => undefined };
  }
  const dev: ChildProcess = spawn(process.execPath, ['scripts/dev.mjs', '--relax-rate-limits'], { cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  // Whole lines only (a chunk can end mid-line); one buffer per stream.
  const reader = () => {
    let partial = '';
    return (d: Buffer) => {
      // eslint-disable-next-line no-control-regex
      const lines = (partial + d.toString()).replace(/\x1b\[[0-9;]*m/g, '').split(/\r?\n/);
      partial = lines.pop() ?? '';
      for (const line of lines) { log += line + '\n'; opts.onLine?.(line); }
    };
  };
  dev.stdout!.on('data', reader());
  dev.stderr!.on('data', reader());
  const stop = () => {
    // On Windows a plain kill orphans mongod / tsx children: end the whole tree.
    if (process.platform === 'win32') { try { execSync(`taskkill /PID ${dev.pid} /T /F`, { stdio: 'ignore' }); } catch { /* already gone */ } }
    else dev.kill('SIGTERM');
  };
  process.on('exit', stop); // also when the script dies on an uncaught error (execSync is allowed in 'exit')
  try {
    await until('the API', () => up(`${API}/health`));
    await until('the client', () => up(CLIENT));
  } catch (err) {
    console.log(log.split('\n').slice(-25).join('\n'));
    stop();
    throw err;
  }
  return { reused: false, relaxed: true, log: () => log, stop };
}
