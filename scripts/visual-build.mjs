#!/usr/bin/env node
// Builds client/dist for the visual tests (npm run test:visual) with the screenshot's SAMPLE build stamp, so
// Settings > About this app shows what settings-dark.png shows: version 11.1.1, built 2026-11-03 08:22:55 UTC
// (1:52 PM in India), commit 57a23685. Only the visual-test build is stamped this way; a normal build reads
// client/package.json, the build time and the git commit (client/vite.config.ts).
// SB_VISUAL_TEST=1 also lets each visual test choose the seasonal Home (localStorage 'sb.visual.seasonalHome'),
// whatever SEASONAL_HOME in client/src/config/seasonal.ts says: the normal Home screens test the normal design.
import { spawnSync } from 'node:child_process';

const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const res = spawnSync(npm, ['run', 'build', '-w', 'client'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, SB_APP_VERSION: '11.1.1', SB_BUILD_TIME: '2026-11-03T08:22:55Z', SB_BUILD_SHA: '57a23685', SB_VISUAL_TEST: '1' },
});
process.exit(res.status ?? 1);
