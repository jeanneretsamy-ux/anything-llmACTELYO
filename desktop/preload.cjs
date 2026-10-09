const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('actelyo', {
  onStatus: (callback) => ipcRenderer.on('actelyo:status', (_, text) => callback(text)),
  retry: () => ipcRenderer.send('actelyo:retry'),
});
