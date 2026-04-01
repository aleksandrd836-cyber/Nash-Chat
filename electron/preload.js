const { contextBridge, ipcRenderer } = require('electron');

// Получение версии синхронно (для совместимости)
const appVersion = ipcRenderer.sendSync('get-app-version');

// СУПЕР-БРИДЖ (Трей + Обновления + Шеринг + Кнопки)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: appVersion,
  
  // --- Демонстрация экрана (ВОССТАНОВЛЕНО) ---
  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  // --- Авто-обновления (ВОССТАНОВЛЕНО) ---
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate:  () => ipcRenderer.invoke('install-update'),
  
  // События обновлений
  onUpdateAvailable:  (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateProgress:   (cb) => ipcRenderer.on('update-progress', (_, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  onUpdateError:      (cb) => ipcRenderer.on('update-error', (_, msg) => cb(msg)),
  
  // --- Горячие клавиши (VIBE v3.2) ---
  registerHotkeys: (shortcuts) => ipcRenderer.send('register-hotkeys', shortcuts),
  onHotkey: (callback) => ipcRenderer.on('hotkey-triggered', (event, action) => callback(action))
});
