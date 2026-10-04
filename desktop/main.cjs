const { app, BrowserWindow, Menu, ipcMain, shell } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const { createRuntime } = require('./runtime.cjs');

app.setName('Actelyo LLMQushu');
app.setAppUserModelId('fr.actelyo.llmqushu');
// The interface does not require a GPU; software rendering also supports PCs
// with older Intel graphics drivers and remote desktop sessions.
app.disableHardwareAcceleration();
// The test override is ignored by the distributed application.
if (!app.isPackaged && process.env.ACTELYO_TEST_HOME) app.setPath('userData', process.env.ACTELYO_TEST_HOME);
const dataArgument = process.argv.find((arg) => arg.startsWith('--data-dir='));
if (dataArgument) {
  const customData = path.resolve(dataArgument.slice('--data-dir='.length));
  fs.mkdirSync(customData, { recursive: true });
  app.setPath('userData', customData);
}
const locked = app.requestSingleInstanceLock();
let window;
let runtime;
let origin;
let starting = false;
let quitting = false;

if (!locked) app.quit();
else {
  app.on('second-instance', () => {
    if (window) { if (window.isMinimized()) window.restore(); window.focus(); }
  });
  app.whenReady().then(() => {
    Menu.setApplicationMenu(Menu.buildFromTemplate([
      { label: 'Actelyo LLMQushu', submenu: [
        { label: 'Dossier de données locales', click: () => shell.openPath(app.getPath('userData')) },
        { type: 'separator' }, { role: 'quit', label: 'Quitter' },
      ] },
      { label: 'Édition', submenu: [{ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
      { label: 'Affichage', submenu: [{ role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { role: 'togglefullscreen' }] },
    ]));
    window = new BrowserWindow({
      width: 1180, height: 820, minWidth: 560, minHeight: 440,
      title: 'Actelyo LLMQushu', icon: path.join(__dirname, 'branding/actelyo.ico'),
      backgroundColor: '#101827', show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    window.once('ready-to-show', () => window.show());
    window.on('page-title-updated', (event) => { event.preventDefault(); window.setTitle('Actelyo LLMQushu'); });
    window.webContents.setWindowOpenHandler(({ url }) => {
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
      return { action: 'deny' };
    });
    window.webContents.on('will-navigate', (event, url) => {
      if (origin && new URL(url).origin === origin) return;
      event.preventDefault();
      if (/^https?:\/\//i.test(url)) shell.openExternal(url);
    });
    window.webContents.session.setPermissionRequestHandler((_contents, permission, callback) => {
      callback(['media', 'clipboard-sanitized-write'].includes(permission));
    });
    ipcMain.on('actelyo:retry', (event) => {
      if (event.sender === window.webContents && event.senderFrame?.url.startsWith('file:')) start();
    });
    start();
  });
}

async function start() {
  if (starting || quitting) return;
  starting = true;
  origin = null;
  runtime?.stop();
  await window.loadFile(path.join(__dirname, 'splash.html'));
  const runtimeDir = app.isPackaged ? path.join(process.resourcesPath, 'runtime') : path.join(__dirname, 'runtime');
  runtime = createRuntime(runtimeDir, app.getPath('userData'), (text) => {
    if (!window.isDestroyed()) window.webContents.send('actelyo:status', text);
  });
  try {
    const result = await runtime.start();
    origin = result.origin;
    if (!quitting) await window.loadURL(origin);
  } catch (err) {
    runtime.stop();
    if (!quitting && !window.isDestroyed()) window.webContents.send('actelyo:status', `Impossible de démarrer. ${err.message}`);
  } finally { starting = false; }
}

app.on('before-quit', () => { quitting = true; runtime?.stop(); });
app.on('window-all-closed', () => app.quit());
