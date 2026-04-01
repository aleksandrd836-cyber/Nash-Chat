const { contextBridge, ipcRenderer } = require('electron');

// Мост между Electron и веб-страницей
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0',
  
  // Регистрация горячих клавиш из интерфейса
  registerHotkeys: (shortcuts) => ipcRenderer.send('register-hotkeys', shortcuts),
  
  // Слушатель нажатия глобальной клавиши
  onHotkey: (callback) => ipcRenderer.on('hotkey-triggered', (event, action) => callback(action))
});
