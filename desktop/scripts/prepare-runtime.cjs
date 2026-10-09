const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const desktop = path.resolve(__dirname, '..');
const root = path.resolve(desktop, '..');
if (process.platform !== 'win32') throw new Error('Le runtime Windows doit être préparé sur Windows.');
const out = path.join(desktop, 'runtime');
fs.mkdirSync(out, { recursive: true });
fs.cpSync(path.join(root, 'server/storage/assets'), path.join(out, 'default-assets'), { recursive: true });
for (const name of ['server', 'collector']) {
  const source = path.join(root, name);
  if (!fs.existsSync(path.join(source, 'node_modules'))) throw new Error(`Installer les dépendances de ${name} avant la compilation.`);
  const destination = path.join(out, name);
  const copy = spawnSync('robocopy', [source, destination, '/E', '/MT:8', '/R:1', '/W:1', '/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/XJ', '/XD', ...['storage', 'public', 'hotdir', '.git'].map((name) => path.join(source, name)), '.cache', '/XF', '.env', '.env.development'], { windowsHide: true, stdio: 'inherit' });
  // Robocopy uses codes 0..7 for successful copies and differences.
  if (copy.error || copy.status === null || copy.status >= 8) throw new Error(`Copie ${name} impossible (${copy.status}).`);
}
const nodeTarget = path.join(out, 'node.exe');
fs.copyFileSync(process.execPath, nodeTarget);
const server = path.join(out, 'server');
const generated = spawnSync(nodeTarget, [path.join(server, 'node_modules/prisma/build/index.js'), 'generate', '--schema', path.join(server, 'prisma/schema.prisma')], { cwd: server, stdio: 'inherit', windowsHide: true });
if (generated.status !== 0) throw new Error('Génération Prisma impossible.');
const frontend = path.join(root, 'frontend/dist');
if (!fs.existsSync(path.join(frontend, 'index.js'))) throw new Error('Compiler le frontend avec VITE_API_BASE=/api.');
// A desktop package must use same-origin API calls, never a hard-coded development port.
if (fs.readFileSync(path.join(frontend, 'index.js'), 'utf8').includes('http://localhost:3001/api')) throw new Error('Recompiler le frontend avec VITE_API_BASE=/api.');
fs.cpSync(frontend, path.join(server, 'public'), { recursive: true });
fs.copyFileSync(path.join(desktop, 'branding/actelyo-logo.png'), path.join(server, 'public/actelyo-logo-nobg.png'));
console.log('Runtime Windows Actelyo LLMQushu préparé.');
