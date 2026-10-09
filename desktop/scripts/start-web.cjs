const fs = require('node:fs');
const path = require('node:path');
const { createRuntime } = require('../runtime.cjs');

const desktop = path.resolve(__dirname, '..');
const repo = path.resolve(desktop, '..');
const value = name => process.argv.find(arg => arg.startsWith(`--${name}=`))?.split('=').slice(1).join('=');
const port = Number(value('port') || 3001);
const home = path.resolve(value('data-dir') || path.join(process.env.LOCALAPPDATA || process.env.HOME, 'Actelyo-RAG-Web'));
const payload = path.join(desktop, 'runtime');
const frontend = path.join(repo, 'frontend/dist');
if (!fs.existsSync(path.join(payload, 'node.exe'))) throw new Error('Préparer le runtime : npm run prepare:runtime --prefix desktop');
if (!fs.existsSync(path.join(frontend, '_index.html'))) throw new Error('Compiler la version web : npm run build --prefix frontend');
// Reuse installed dependencies; refresh only the current web assets and metadata.
fs.cpSync(frontend, path.join(payload, 'server/public'), { recursive: true });
fs.copyFileSync(path.join(repo, 'server/utils/boot/MetaGenerator.js'), path.join(payload, 'server/utils/boot/MetaGenerator.js'));
const runtime = createRuntime(payload, home, message => console.log(message), { apiPort: port });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => { runtime.stop(); process.exit(0); });
process.on('exit', () => runtime.stop());
runtime.start().then(({ origin }) => {
  fs.writeFileSync(path.join(home, 'web-connection.json'), JSON.stringify({ name: 'Actelyo RAG', url: origin }));
  console.log(`Actelyo RAG prêt : ${origin}`);
}).catch(error => { console.error(error.message); runtime.stop(); process.exitCode = 1; });
