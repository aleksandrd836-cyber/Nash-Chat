const { contextBridge, ipcRenderer } = require('electron');

const appVersion = ipcRenderer.sendSync('get-app-version');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version:  appVersion,

  // Проверка обновлений (возвращает { current, latest })
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),

  // Открывает браузер для скачивания новой версии
  downloadUpdate: (url) => ipcRenderer.invoke('download-update', url),

  // События
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateError:     (cb) => ipcRenderer.on('update-error',     (_, msg)  => cb(msg)),
});
