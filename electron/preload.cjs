const { contextBridge, ipcRenderer } = require('electron');

const appVersion = ipcRenderer.sendSync('get-app-version');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version:  appVersion,

  // Проверка обновлений (возвращает { current, latest })
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Скачивание и установка
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate:  () => ipcRenderer.invoke('install-update'),

  // События
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available',  (_, info) => cb(info)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress',   (_, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  onUpdateError:      (cb) => ipcRenderer.on('update-error',      (_, msg)  => cb(msg)),
});
