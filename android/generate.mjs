// Generates the Android (Trusted Web Activity) Gradle project from android/twa-manifest.json with Google's
// Bubblewrap (@bubblewrap/core, Apache-2.0), the same generator PWABuilder uses. Bubblewrap is NOT a dependency of
// this repo: install it in a folder of its own outside the repo and point BUBBLEWRAP_DIR at it.
//
//   BUBBLEWRAP_DIR=<folder with node_modules/@bubblewrap/core> node android/generate.mjs <empty output folder>
//
// Then build and sign as README "Android app (Trusted Web Activity)" says. The output folder is a build product:
// keep it outside the repo.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const dir = process.env.BUBBLEWRAP_DIR;
const out = process.argv[2];
if (!dir || !out) {
  console.error('Usage: BUBBLEWRAP_DIR=<folder> node android/generate.mjs <empty output folder>');
  process.exit(2);
}
const require = createRequire(path.join(path.resolve(dir), 'package.json'));
const { TwaManifest, TwaGenerator, ConsoleLog } = require('@bubblewrap/core');

const here = path.dirname(fileURLToPath(import.meta.url));
const json = JSON.parse(fs.readFileSync(path.join(here, 'twa-manifest.json'), 'utf8'));
const manifest = new TwaManifest(json);
const problem = manifest.validate();
if (problem) {
  console.error('twa-manifest.json:', problem);
  process.exit(1);
}
fs.mkdirSync(out, { recursive: true });
if (fs.readdirSync(out).length > 0) {
  console.error(`${out} is not empty`);
  process.exit(1);
}
await new TwaGenerator().createTwaProject(path.resolve(out), manifest, new ConsoleLog('generate'));
await manifest.saveToFile(path.join(out, 'twa-manifest.json'));
console.log(`Generated ${manifest.packageId} versionCode ${manifest.appVersionCode} in ${path.resolve(out)}`);
