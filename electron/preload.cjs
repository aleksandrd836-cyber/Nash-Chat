const { contextBridge, ipcRenderer } = require('electron');

// Получаем версию из main-процесса (работает корректно в упакованном .asar)
const appVersion = ipcRenderer.sendSync('get-app-version');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: appVersion,

  // Автообновление
  checkForUpdates:   ()  => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate:    ()  => ipcRenderer.invoke('download-update'),
  installUpdate:     ()  => ipcRenderer.invoke('install-update'),

  onUpdateAvailable: (cb) => ipcRenderer.on('update-available',  (_, info)     => cb(info)),
  onUpdateProgress:  (cb) => ipcRenderer.on('update-progress',   (_, progress) => cb(progress)),
  onUpdateDownloaded:(cb) => ipcRenderer.on('update-downloaded', ()            => cb()),
  onUpdateError:     (cb) => ipcRenderer.on('update-error',      (_, msg)      => cb(msg)),
});
