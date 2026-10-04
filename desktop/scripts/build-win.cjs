const path = require('node:path');
const { spawnSync } = require('node:child_process');
const desktop = path.resolve(__dirname, '..');
const env = {
  ...process.env,
  ELECTRON_BUILDER_CACHE: process.env.ELECTRON_BUILDER_CACHE || path.join(desktop, '.cache', 'builder'),
};
for (const args of [
  [path.join(__dirname, 'prepare-runtime.cjs')],
  [path.join(desktop, 'node_modules/electron-builder/cli.js'), '--win', 'nsis', '--x64', '--publish', 'never'],
]) {
  const result = spawnSync(process.execPath, args, { cwd: desktop, env, windowsHide: true, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
