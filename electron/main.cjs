const { app, BrowserWindow, shell, Menu, globalShortcut, ipcMain, Tray, nativeImage, desktopCapturer } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://vbchat.ru/';
let mainWindow;
let tray = null;
let isQuitting = false;

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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    frame: true,
    show: false,
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.loadURL(APP_URL);

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(APP_URL)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // --- Сворачивание в трей при закрытии (Крестик) ---
  mainWindow.on('close', (event) => {
    if (!isQuitting) {
      event.preventDefault();
      mainWindow.hide();
      return false;
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --- СИСТЕМНЫЙ ТРЕЙ (ВОССТАНОВЛЕНО) ---
function createTray() {
  if (tray) return;
  const iconPath = path.join(__dirname, 'icon.png');
  const trayIcon = nativeImage.createFromPath(iconPath).resize({ width: 24, height: 24 });
  tray = new Tray(trayIcon);
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Открыть Vibe', click: () => { mainWindow?.show(); mainWindow?.focus(); } },
    { type: 'separator' },
    { label: 'Выйти', click: () => { isQuitting = true; app.quit(); } }
  ]);
  
  tray.setToolTip('Vibe');
  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
     if (mainWindow?.isVisible()) {
       mainWindow.hide();
     } else {
       mainWindow?.show();
       mainWindow?.focus();
     }
  });
}

// --- Регистрация горячих клавиш (VIBE v3.0) ---
ipcMain.on('register-hotkeys', (event, shortcuts) => {
  globalShortcut.unregisterAll(); 
  
  if (shortcuts.mute) {
    try {
      globalShortcut.register(shortcuts.mute, () => {
        mainWindow?.webContents.send('hotkey-triggered', 'mute');
      });
    } catch (e) { console.error('Error registering mute:', e); }
  }

  if (shortcuts.deafen) {
    try {
      globalShortcut.register(shortcuts.deafen, () => {
        mainWindow?.webContents.send('hotkey-triggered', 'deafen');
      });
    } catch (e) { console.error('Error registering deafen:', e); }
  }
});

// --- Демонстрация экрана (Screen Sharing - ВОССТАНОВЛЕНО) ---
ipcMain.handle('get-desktop-sources', async () => {
  return await desktopCapturer.getSources({ types: ['window', 'screen'] });
});

// --- Версия приложения (ВОССТАНОВЛЕНО) ---
ipcMain.on('get-app-version', (event) => {
  event.returnValue = app.getVersion();
});

// --- Авто-обновление (ВОССТАНОВЛЕНО) ---
ipcMain.handle('check-for-updates', () => autoUpdater.checkForUpdatesAndNotify());
autoUpdater.on('update-available', () => mainWindow?.webContents.send('update-available'));
autoUpdater.on('update-not-available', () => mainWindow?.webContents.send('update-not-available'));
autoUpdater.on('error', (err) => mainWindow?.webContents.send('update-error', err.message));
autoUpdater.on('download-progress', (p) => mainWindow?.webContents.send('download-progress', p.percent));
autoUpdater.on('update-downloaded', () => mainWindow?.webContents.send('update-downloaded'));

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();
  createTray();
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => globalShortcut.unregisterAll());
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
