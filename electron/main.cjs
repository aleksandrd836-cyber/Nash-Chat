const { app, BrowserWindow, shell, Menu, ipcMain, desktopCapturer, session, Tray, nativeImage } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://vbchat.ru/';

let mainWindow;
let splashWindow;
let tray;
let isQuitting = false;

// ── Splash screen (появляется мгновенно) ──
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
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          background: #1e1f22;
          border-radius: 16px;
          border: 1px solid rgba(255,255,255,0.08);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100vh;
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          color: white;
          overflow: hidden;
          box-shadow: 0 20px 60px rgba(0,0,0,0.5);
        }
        .logo {
          width: 90px;
          height: 90px;
          background: rgba(0, 240, 255, 0.1);
          border-radius: 28px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 24px;
          box-shadow: 0 0 30px rgba(0, 240, 255, 0.2);
          border: 2px solid rgba(0, 240, 255, 0.3);
          position: relative;
        }
        .logo svg { 
          width: 50px; 
          height: 50px; 
          fill: #00f0ff; 
          filter: drop-shadow(0 0 10px rgba(0, 240, 255, 0.8));
        }
        h1 { font-size: 26px; font-weight: 900; margin-bottom: 4px; letter-spacing: 4px; text-transform: uppercase; color: #fff; }
        p { font-size: 10px; color: #00f0ff; margin-bottom: 32px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; opacity: 0.8; }
        .spinner {
          width: 24px; height: 24px;
          border: 2px solid rgba(255,255,255,0.05);
          border-top-color: #00f0ff;
          border-radius: 50%;
          animation: spin 0.8s cubic-bezier(0.4, 0, 0.2, 1) infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="logo">
        <svg viewBox="0 0 24 24">
          <path d="M12 2L14.4 8.6H21L15.6 12.7L18 19.3L12 15.2L6 19.3L8.4 12.7L3 8.6H9.6L12 2Z" />
        </svg>
      </div>
      <h1>Vibe</h1>
      <p>Запуск...</p>
      <div class="spinner"></div>
    </body>
    </html>
  `)}`);
  splashWindow.show();
}

// ── Главное окно (загружает сайт в фоне) ──
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
    show: false, // скрыто до полной загрузки
  });

  mainWindow.loadURL(APP_URL);

  // Когда страница загружена — закрываем сплэш, показываем основное окно
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.setTitle('Vibe');
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.focus();
    }, 300);
  });

  mainWindow.webContents.on('did-fail-load', () => {
    if (splashWindow && !splashWindow.isDestroyed()) {
      splashWindow.close();
      splashWindow = null;
    }
    mainWindow.show();
  });

  // Внешние ссылки — в браузер
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Перехват закрытия окна — сворачиваем в трей
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
    return false;
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── Системный трей ──
function createTray() {
  const iconPath = path.join(__dirname, 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath);
  
  tray = new Tray(trayIcon.resize({ width: 16, height: 16 }));
  
  const contextMenu = Menu.buildFromTemplate([
    { 
      label: 'Развернуть Vibe', 
      click: () => {
        mainWindow.show();
        mainWindow.focus();
      } 
    },
    { type: 'separator' },
    { 
      label: 'Выйти', 
      click: () => {
        isQuitting = true;
        app.quit();
      } 
    }
  ]);

  tray.setToolTip('Vibe — Чат будущего');
  tray.setContextMenu(contextMenu);

  // Одинарный клик по иконке разворачивает окно
  tray.on('click', () => {
    if (mainWindow.isVisible()) {
      mainWindow.focus();
    } else {
      mainWindow.show();
      mainWindow.focus();
    }
  });
}

Menu.setApplicationMenu(null);

ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion();
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
  createTray();

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-available', (info) => {
    mainWindow?.webContents.send('update-available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    mainWindow?.webContents.send('update-progress', progress);
  });

  autoUpdater.on('update-downloaded', () => {
    mainWindow?.webContents.send('update-downloaded');
  });

  autoUpdater.on('error', (err) => {
    mainWindow?.webContents.send('update-error', err.message);
  });

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

  ipcMain.handle('install-update',    () => { autoUpdater.quitAndInstall(); });

  session.defaultSession.setPermissionCheckHandler((webContents, permission) => {
    if (permission === 'media') return true;
    return false;
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    if (permission === 'media') return callback(true);
    callback(false);
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // На Windows мы не выходим, так как приложение висит в трее
  }
});

app.on('before-quit', () => {
  isQuitting = true;
});
