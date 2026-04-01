const { contextBridge, ipcRenderer } = require('electron');

// Полный реставрированный мост (Обновления + Горячие клавиши)
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: '2.4.5', // Обновлено до v2.4.5
  
  // --- Авто-обновления (Восстановлено) ---
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', cb),
  onUpdateNotAvailable: (cb) => ipcRenderer.on('update-not-available', cb),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (e, msg) => cb(msg)),
  onDownloadProgress: (cb) => ipcRenderer.on('download-progress', (e, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', cb),
  
  // --- Горячие клавиши (VIBE v3.0) ---
  registerHotkeys: (shortcuts) => ipcRenderer.send('register-hotkeys', shortcuts),
  onHotkey: (callback) => ipcRenderer.on('hotkey-triggered', (event, action) => callback(action))
});
