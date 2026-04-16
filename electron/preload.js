const { contextBridge, ipcRenderer } = require('electron');

const appVersion = ipcRenderer.sendSync('get-app-version');

contextBridge.exposeInMainWorld('electronAPI', {
  platform: process.platform,
  version: appVersion,

  getDesktopSources: () => ipcRenderer.invoke('get-desktop-sources'),

  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),

  onUpdateAvailable: (cb) => ipcRenderer.on('update-available', (_, info) => cb(info)),
  onUpdateProgress: (cb) => ipcRenderer.on('update-progress', (_, progress) => cb(progress)),
  onUpdateDownloaded: (cb) => ipcRenderer.on('update-downloaded', () => cb()),
  onUpdateError: (cb) => ipcRenderer.on('update-error', (_, msg) => cb(msg)),

  registerHotkeys: (shortcuts) => ipcRenderer.send('register-hotkeys', shortcuts),
  onHotkey: (callback) => {
    const listener = (event, action) => callback(action);
    ipcRenderer.on('hotkey-triggered', listener);
    return () => ipcRenderer.removeListener('hotkey-triggered', listener);
  },

  onAppQuitRequested: (callback) => {
    const listener = () => callback();
    ipcRenderer.on('app-quit-requested', listener);
    return () => ipcRenderer.removeListener('app-quit-requested', listener);
  },
  notifyAppQuitReady: () => ipcRenderer.send('app-quit-ready'),
});
