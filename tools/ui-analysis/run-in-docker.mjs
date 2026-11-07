#!/usr/bin/env node
// Run a ui-analysis / visual-test script inside Playwright's official Linux image.
// Linux Chromium rasterises text with FreeType like Android Chrome, so diffs are consistent and closer
// to the reference screenshots than on Windows/macOS. ALL visual numbers are reported from this image.
//
//   node tools/ui-analysis/run-in-docker.mjs src/fontfit.ts [args...]
//
// The repo is bind-mounted (read-write for outputs). Gitignored private data (reference screenshots,
// client/tests/fixtures/private/) is mounted, never copied into an image.
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../..');
const pwVersion = JSON.parse(readFileSync(path.join(here, 'node_modules/playwright/package.json'), 'utf8')).version;
const image = `mcr.microsoft.com/playwright:v${pwVersion}-noble`;
const [script, ...args] = process.argv.slice(2);
if (!script) { console.error('usage: node tools/ui-analysis/run-in-docker.mjs <script.ts> [args...]'); process.exit(2); }

const env = Object.entries(process.env).filter(([k]) => ['MODE', 'LIB', 'FONT_ONLY', 'ONLY', 'FORCE_T'].includes(k)).flatMap(([k, v]) => ['-e', `${k}=${v}`]);
const res = spawnSync('docker', [
  'run', '--rm', '--ipc=host', '--init',
  '-v', `${root}:/work`,
  '-w', '/work/tools/ui-analysis',
  '-e', 'UI_OUT=/work/tools/ui-analysis/out/linux',
  // Android Chrome does not hint glyphs and positions them sub-pixel; Linux headless hints by default.
  // Measured: mean text mismatch 24.8% (default) -> 8.6% (hinting off) on the same samples.
  '-e', `CHROMIUM_ARGS=${process.env.CHROMIUM_ARGS ?? '--font-render-hinting=none'}`,
  ...env,
  image, 'node', script, ...args,
], { stdio: 'inherit', env: { ...process.env, MSYS_NO_PATHCONV: '1' } });
process.exit(res.status ?? 1);
