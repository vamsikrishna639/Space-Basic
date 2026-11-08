#!/usr/bin/env node
// `npm run dev`: start the API server and the Vite client together, with prefixed output.
// No extra dependency: plain child processes. Ctrl+C stops both.
//   --relax-rate-limits   (or `npm run dev:relaxed`) sets RELAX_RATE_LIMITS=true for the API: raised sign-in and code
//                         limits for repeated local smoke runs. Development only; the API refuses it in production.
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';

const relaxed = process.argv.includes('--relax-rate-limits');
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const procs = [
  { name: 'db    ', color: 33, args: ['run', 'dev:db', '-w', 'server'] },
  { name: 'server', color: 36, args: ['run', 'dev', '-w', 'server'] },
  // The client workspace is created at the frontend step; until then only the API runs.
  ...(existsSync(new URL('../client/package.json', import.meta.url))
    ? [{ name: 'client', color: 35, args: ['run', 'dev', '-w', 'client'] }]
    : []),
];
const children = procs.map(({ name, color, args }) => {
  const child = spawn(npm, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: process.platform === 'win32', env: { ...process.env, FORCE_COLOR: '1', ...(relaxed ? { RELAX_RATE_LIMITS: 'true' } : {}) } });
  const prefix = `\x1b[${color}m[${name}]\x1b[0m `;
  const pipe = (stream, out) => {
    let buf = '';
    stream.on('data', (d) => { buf += d; const lines = buf.split(/\r?\n/); buf = lines.pop() ?? ''; for (const l of lines) out.write(prefix + l + '\n'); });
  };
  pipe(child.stdout, process.stdout); pipe(child.stderr, process.stderr);
  child.on('exit', (code) => { process.stdout.write(`${prefix}exited with code ${code}\n`); shutdown(code ?? 0); });
  return child;
});
let stopping = false;
function shutdown(code) {
  if (stopping) return; stopping = true;
  for (const c of children) if (!c.killed) c.kill();
  setTimeout(() => process.exit(code), 500);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));
