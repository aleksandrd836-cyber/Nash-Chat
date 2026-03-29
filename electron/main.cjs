const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');
const https = require('https');

const APP_URL = 'https://nash-chat1.pages.dev/';

let mainWindow;
let splashWindow;

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

  // Встроенный HTML — не грузит интернет, открывается за <100мс
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
          width: 72px;
          height: 72px;
          background: #5865F2;
          border-radius: 20px;
          display: flex;
          align-items: center;
          justify-content: center;
          margin-bottom: 20px;
          box-shadow: 0 8px 32px rgba(88,101,242,0.4);
        }
        .logo svg { width: 40px; height: 40px; fill: white; }
        h1 { font-size: 22px; font-weight: 700; margin-bottom: 6px; }
        p { font-size: 13px; color: #b5bac1; margin-bottom: 32px; }
        .spinner {
          width: 28px; height: 28px;
          border: 3px solid rgba(255,255,255,0.15);
          border-top-color: #5865F2;
          border-radius: 50%;
          animation: spin 0.8s linear infinite;
        }
        @keyframes spin { to { transform: rotate(360deg); } }
      </style>
    </head>
    <body>
      <div class="logo">
        <svg viewBox="0 0 24 24"><path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057.104 18.076.119 18.09.137 18.1a19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03z"/></svg>
      </div>
      <h1>NashChat</h1>
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
    title: 'NashChat',
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
    // Фиксируем заголовок — сайт не должен его перезаписывать
    mainWindow.setTitle('NashChat');
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
        splashWindow = null;
      }
      mainWindow.show();
      mainWindow.focus();
    }, 300); // небольшая пауза для плавности
  });

  // Если сайт не загрузился — всё равно показываем окно
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

  mainWindow.on('closed', () => { mainWindow = null; });
}

Menu.setApplicationMenu(null);

// Синхронный IPC для получения версии в preload (работает в .asar)
ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion();
});

// ── Проверка обновлений через Cloudflare (без GitHub API) ──
const VERSION_URL = 'https://nash-chat1.pages.dev/version.json';

function fetchLatestVersion() {
  return new Promise((resolve, reject) => {
    https.get(VERSION_URL, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

function isNewer(current, latest) {
  const c = current.split('.').map(Number);
  const l = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(c.length, l.length); i++) {
    if ((l[i] || 0) > (c[i] || 0)) return true;
    if ((l[i] || 0) < (c[i] || 0)) return false;
  }
  return false;
}

ipcMain.handle('check-for-updates', async () => {
  const data   = await fetchLatestVersion();
  const latest  = data.version;
  const current = app.getVersion();
  if (isNewer(current, latest)) {
    mainWindow?.webContents.send('update-available', {
      version:     latest,
      downloadUrl: data.downloadUrl,
    });
  }
  return { current, latest };
});

// Открываем браузер для скачивания
ipcMain.handle('download-update', (_, url) => {
  shell.openExternal(url || 'https://github.com/aleksandrd836-cyber/Nash-Chat/releases/latest');
});

app.whenReady().then(() => {
  createSplash();
  createWindow();
});

app.on('window-all-closed', () => { app.quit(); });
