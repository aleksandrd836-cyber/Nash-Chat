const { contextBridge } = require('electron');

// Мост между Electron и веб-страницей
// Можно добавить нативные API, если понадобятся
contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: process.env.npm_package_version ?? '1.0.0',
});
