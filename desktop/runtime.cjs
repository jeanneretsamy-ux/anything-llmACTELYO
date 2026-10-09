const fs = require('node:fs');
const path = require('node:path');
const net = require('node:net');
const { spawn, spawnSync } = require('node:child_process');

function freePort() {
  return new Promise((resolve, reject) => {
    const socket = net.createServer();
    socket.once('error', reject);
    socket.listen(0, '127.0.0.1', () => {
      const port = socket.address().port;
      socket.close(() => resolve(port));
    });
  });
}

function createRuntime(runtimeDir, dataDir, status, options = {}) {
  const children = new Set();
  let stopped = false;
  let serviceFailure = null;
  fs.mkdirSync(dataDir, { recursive: true });
  const log = fs.openSync(path.join(dataDir, 'desktop.log'), 'a');
  const node = path.join(runtimeDir, 'node.exe');
  const server = path.join(runtimeDir, 'server');
  const collector = path.join(runtimeDir, 'collector');

  function launch(args, cwd, env) {
    if (stopped) throw new Error('Démarrage annulé.');
    const child = spawn(node, args, { cwd, env, windowsHide: true, stdio: ['ignore', log, log] });
    children.add(child);
    child.once('exit', () => children.delete(child));
    return child;
  }

  async function start() {
    if (!fs.existsSync(node)) throw new Error('Runtime local absent. Recompiler avec npm run build:win.');
    const storage = path.join(dataDir, 'storage');
    for (const dir of ['documents', 'direct-uploads', 'vector-cache', 'models', 'logs', 'comkey', 'assets']) {
      fs.mkdirSync(path.join(storage, dir), { recursive: true });
    }
    for (const name of ['anything-llm.png', 'anything-llm-invert.png']) {
      fs.copyFileSync(path.join(runtimeDir, 'default-assets', name), path.join(storage, 'assets', name));
    }
    // Explicitly create the SQLite file before invoking the migration engine.
    // Opening in append mode preserves every existing database byte.
    fs.closeSync(fs.openSync(path.join(storage, 'anythingllm.db'), 'a'));
    const settingsDir = path.join(dataDir, 'server');
    const workDir = path.join(dataDir, 'collector');
    for (const name of ['hotdir', 'tmp']) fs.mkdirSync(path.join(workDir, name), { recursive: true });
    fs.mkdirSync(settingsDir, { recursive: true });
    const envPath = path.join(settingsDir, '.env');
    if (!fs.existsSync(envPath)) fs.writeFileSync(envPath, '# Actelyo LLMQushu\n', { flag: 'wx' });
    const apiPort = options.apiPort ?? await freePort();
    if (!Number.isInteger(apiPort) || apiPort < 1024 || apiPort > 65535) throw new Error('Port local invalide.');
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', () => reject(new Error(`Le port ${apiPort} est déjà utilisé. Choisissez un autre port ou ouvrez le service déjà démarré.`)));
      probe.listen(apiPort, '127.0.0.1', () => probe.close(resolve));
    });
    let collectorPort = await freePort();
    while (collectorPort === apiPort) collectorPort = await freePort();
    const env = {
      ...process.env,
      NODE_ENV: 'production',
      ACTELYO_BIND_HOST: '127.0.0.1',
      ACTELYO_ENV_PATH: envPath,
      ACTELYO_WORK_DIR: workDir,
      ACTELYO_DATABASE_URL: `file:${path.join(storage, 'anythingllm.db').replace(/\\/g, '/')}`,
      STORAGE_DIR: storage,
      SERVER_PORT: String(apiPort),
      COLLECTOR_PORT: String(collectorPort),
      DISABLE_TELEMETRY: 'true',
      DISABLE_SWAGGER_DOCS: 'true',
    };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.NODE_OPTIONS;
    status('Préparation de la base locale…');
    const schemaDir = path.join(dataDir, 'prisma');
    fs.mkdirSync(schemaDir, { recursive: true });
    const schema = fs.readFileSync(path.join(server, 'prisma/schema.prisma'), 'utf8')
      .replace('url      = "file:../storage/anythingllm.db"', 'url      = env("ACTELYO_DATABASE_URL")');
    fs.writeFileSync(path.join(schemaDir, 'schema.prisma'), schema);
    fs.cpSync(path.join(server, 'prisma/migrations'), path.join(schemaDir, 'migrations'), { recursive: true });
    await new Promise((resolve, reject) => {
      const migration = launch([path.join(server, 'node_modules/prisma/build/index.js'), 'migrate', 'deploy', '--schema', path.join(schemaDir, 'schema.prisma')], settingsDir, env);
      const timer = setTimeout(() => { migration.kill(); reject(new Error('La migration locale a dépassé le délai.')); }, 120000);
      migration.once('error', (err) => { clearTimeout(timer); reject(err); });
      migration.once('exit', (code) => { clearTimeout(timer); code === 0 ? resolve() : reject(new Error(`Migration interrompue (${code}). Consulter desktop.log.`)); });
    });
    status('Démarrage du serveur et du traitement des documents…');
    for (const service of [server, collector]) {
      const child = launch([path.join(service, 'index.js')], settingsDir, env);
      child.once('error', (err) => { serviceFailure = err; });
      child.once('exit', (code) => { if (!stopped) serviceFailure = new Error(`Service local arrêté (${code}). Consulter desktop.log.`); });
    }
    const origin = `http://127.0.0.1:${apiPort}`;
    const deadline = Date.now() + 300000;
    while (Date.now() < deadline) {
      if (stopped) throw new Error('Démarrage annulé.');
      if (serviceFailure) throw serviceFailure;
      try {
        const options = { signal: AbortSignal.timeout(1500) };
        const ping = await fetch(`${origin}/api/ping`, options);
        const accepts = await fetch(`http://127.0.0.1:${collectorPort}/accepts`, { signal: AbortSignal.timeout(1500) });
        if (ping.ok && accepts.ok) return { origin, apiPort, collectorPort };
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Les services locaux ne répondent pas. Consulter desktop.log.');
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    for (const child of children) {
      if (!child.pid) continue;
      if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 5000, stdio: 'ignore' });
      else child.kill();
    }
    children.clear();
    fs.closeSync(log);
  }
  return { start, stop };
}

module.exports = { createRuntime, freePort };
