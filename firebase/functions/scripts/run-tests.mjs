// Runs the vitest suite inside `firebase emulators:exec` (auth, firestore, functions, storage).
// Usage: node scripts/run-tests.mjs [--serve]   (--serve just starts the emulators)
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const firebaseDir = resolve(here, '..', '..');
const cli = join(firebaseDir, 'node_modules', 'firebase-tools', 'lib', 'bin', 'firebase.js');
if (!existsSync(cli)) {
  console.error('firebase-tools not installed. Run `npm install` in firebase/ first.');
  process.exit(1);
}
const env = { ...process.env };
const jbr = 'C:/Program Files/Android/Android Studio/jbr/bin';
const cur = env.PATH ?? env.Path ?? "";
if (process.platform === "win32" && existsSync(jbr) && !cur.includes(jbr)) {
  delete env.Path;
  env.PATH = `${jbr};${cur}`;
}
const serve = process.argv.includes('--serve');
// Loading the functions source can exceed the 10 s discovery default on a busy machine.
env.FUNCTIONS_DISCOVERY_TIMEOUT ??= '120';
// The test suite runs on its own ports (firebase.test.json) so it never collides with a dev emulator on the defaults.
// QWIKMART_TEST_CONFIG=<file> runs on another emulator config (e.g. firebase.qa-backend.json); ports are read from it.
const configFile = process.env.QWIKMART_TEST_CONFIG || 'firebase.test.json';
const emu = JSON.parse(readFileSync(join(firebaseDir, configFile), 'utf8')).emulators ?? {};
Object.assign(env, {
  QWIKMART_TEST_PORTS: '1',
  FIRESTORE_PORT: String(emu.firestore?.port ?? 18080), AUTH_PORT: String(emu.auth?.port ?? 19099),
  FUNCTIONS_PORT: String(emu.functions?.port ?? 15001), STORAGE_PORT: String(emu.storage?.port ?? 19199),
});
const args = serve
  ? [cli, 'emulators:start', '--project', 'qwikmart-37299']
  : [cli, 'emulators:exec', '--config', configFile, '--project', 'qwikmart-37299', '--only', 'auth,firestore,functions,storage', `npm --prefix functions run test:run${process.env.VITEST_ARGS ? ' -- ' + process.env.VITEST_ARGS : ''}`];
const r = spawnSync(process.execPath, args, { cwd: firebaseDir, env, stdio: 'inherit' });
process.exit(r.status ?? 1);
