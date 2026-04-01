const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer, session, Tray, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://vbchat.ru/';

let mainWindow;
let splashWindow;
let tray;
let isQuitting = false;

// ── SINGLE INSTANCE LOCK ──
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (event, commandLine, workingDirectory) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    createSplash();
    createWindow();
    createTray();

    setupUpdater();
    setupIpcHandlers();
    setupPermissions();
  });
}

function createSplash() {
  splashWindow = new BrowserWindow({
    width: 360,
    height: 260,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: { nodeIntegration: true, contextIsolation: false },
  });

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <style>
        body { background: #1e1f22; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; color: white; margin: 0; border-radius: 16px; border: 1px solid rgba(255,255,255,0.1); overflow: hidden; }
        .logo { width: 80px; height: 80px; background: rgba(0, 240, 255, 0.1); border-radius: 20px; display: flex; align-items: center; justify-content: center; margin-bottom: 20px; border: 2px solid rgba(0, 240, 255, 0.3); }
        .spinner { width: 24px; height: 24px; border: 2px solid rgba(255,255,255,0.1); border-top-color: #00f0ff; border-radius: 50%; animation: spin 1s linear infinite; }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="logo">
        <svg width="40" height="40" viewBox="0 0 24 24"><path fill="#00f0ff" d="M12 2L14.4 8.6H21L15.6 12.7L18 19.3L12 15.2L6 19.3L8.4 12.7L3 8.6H9.6L12 2Z" /></svg>
      </div>
      <h1 style="font-size: 20px; letter-spacing: 2px;">VIBE</h1>
      <div class="spinner"></div>
    </body>
    </html>
  `)}`);
  splashWindow.show();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    title: 'Vibe',
    backgroundColor: '#1e1f22',
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    frame: true,
    show: false,
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle('Vibe');
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.focus();
    }, 500);
  });

  mainWindow.webContents.on('did-fail-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Развернуть Vibe', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Выйти', click: () => { isQuitting = true; app.quit(); } }
  ]);

  tray.setToolTip('Vibe — Чат будущего');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow.isVisible()) mainWindow.focus();
    else { mainWindow.show(); mainWindow.focus(); }
  });
}

function setupUpdater() {
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', (info) => mainWindow?.webContents.send('update-available', info));
  autoUpdater.on('download-progress', (progress) => mainWindow?.webContents.send('update-progress', progress));
  autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update-downloaded'));
  autoUpdater.on('error', (err) => mainWindow?.webContents.send('update-error', err.message));
}

function setupIpcHandlers() {
  ipcMain.on('get-app-version', (event) => { event.returnValue = app.getVersion(); });
  ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdates());
  ipcMain.handle('download-update',   () => autoUpdater.downloadUpdate());
  ipcMain.handle('get-desktop-sources', async () => {
    const sources = await desktopCapturer.getSources({ 
      types: ['window', 'screen'],
      thumbnailSize: { width: 400, height: 225 },
      fetchWindowIcons: true
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
      appIcon: s.appIcon ? s.appIcon.toDataURL() : null
    }));
  });
  ipcMain.handle('install-update', () => { autoUpdater.quitAndInstall(); });
}

function setupPermissions() {
  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    return permission === 'media';
  });
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'media');
  });
}

Menu.setApplicationMenu(null);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') { /* Keep alive for tray */ }
});

app.on('before-quit', () => { isQuitting = true; });
