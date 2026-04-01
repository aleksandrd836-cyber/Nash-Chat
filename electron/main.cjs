const { app, BrowserWindow, shell, Menu, globalShortcut, ipcMain } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

const APP_URL = 'https://vbchat.ru/';

let mainWindow;

// РҐСЂР°РЅРёР»РёС‰Рµ Р°РєС‚РёРІРЅС‹С… РіРѕСЂСЏС‡РёС… РєР»Р°РІРёС€
let activeShortcuts = {
  mute: '',
  deafen: ''
};

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

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Р Р•Р“Р˜РЎРўР РђР¦Р˜РЇ Р“РћР РЇР§Р˜РҐ РљР›РђР’Р˜РЁ
ipcMain.on('register-hotkeys', (event, shortcuts) => {
  globalShortcut.unregisterAll(); // РЎР±СЂР°СЃС‹РІР°РµРј СЃС‚Р°СЂС‹Рµ
  
  if (shortcuts.mute) {
    try {
      globalShortcut.register(shortcuts.mute, () => {
        mainWindow?.webContents.send('hotkey-triggered', 'mute');
      });
    } catch (e) {
      console.error('Failed to register mute shortcut:', e);
    }
  }

  if (shortcuts.deafen) {
    try {
      globalShortcut.register(shortcuts.deafen, () => {
        mainWindow?.webContents.send('hotkey-triggered', 'deafen');
      });
    } catch (e) {
      console.error('Failed to register deafen shortcut:', e);
    }
  }
});

// --- Р›РћР“Р˜РљРђ РђР’РўРћ-РћР‘РќРћР’Р›Р•РќР˜Р™ (Р’РћРЎРЎРўРђРќРћР’Р›Р•РќРћ) ---
ipcMain.handle('check-for-updates', () => {
  autoUpdater.checkForUpdatesAndNotify();
});

autoUpdater.on('update-available', () => {
  mainWindow?.webContents.send('update-available');
});

autoUpdater.on('update-not-available', () => {
  mainWindow?.webContents.send('update-not-available');
});

autoUpdater.on('error', (err) => {
  mainWindow?.webContents.send('update-error', err.message);
});

autoUpdater.on('download-progress', (progressObj) => {
  mainWindow?.webContents.send('download-progress', progressObj.percent);
});

autoUpdater.on('update-downloaded', () => {
  mainWindow?.webContents.send('update-downloaded');
});

Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  app.quit();
});
