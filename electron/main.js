const { app, BrowserWindow, shell, Menu } = require('electron');
const path = require('path');

const APP_URL = 'https://solitary-cloud-a126.aleksandrd836.workers.dev/';

let mainWindow;

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
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    // Убираем стандартную рамку Windows — выглядит современнее
    frame: true,
    show: false, // не показываем до загрузки
  });

  // Показываем окно когда страница готова (без белой вспышки)
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Загружаем сайт
  mainWindow.loadURL(APP_URL);

  // Внешние ссылки открываем в браузере, не в приложении
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

// Убираем стандартное меню (File, Edit, View...)
Menu.setApplicationMenu(null);

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  app.quit();
});
