const { contextBridge, ipcRenderer } = require('electron');
const pkg = require('../package.json');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: pkg.version,

  // Автообновление
  checkForUpdates:  ()   => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate:   ()   => ipcRenderer.invoke('download-update'),
  installUpdate:    ()   => ipcRenderer.invoke('install-update'),

  onUpdateAvailable: (cb) => ipcRenderer.on('update-available',  (_, info)     => cb(info)),
  onUpdateProgress:  (cb) => ipcRenderer.on('update-progress',   (_, progress)  => cb(progress)),
  onUpdateDownloaded:(cb) => ipcRenderer.on('update-downloaded', ()             => cb()),
  onUpdateError:     (cb) => ipcRenderer.on('update-error',      (_, msg)       => cb(msg)),
});
