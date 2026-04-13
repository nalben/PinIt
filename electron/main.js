const path = require('path');
const { app, BrowserWindow, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');

const APP_ID = 'ru.pinit.desktop';
const APP_URL = 'https://pin-it.ru';
const UPDATE_URL = 'https://pin-it.ru/desktop-updates/';
const ICON_PATH = path.join(__dirname, 'assets', 'icon.png');

let mainWindow = null;
let updateHandlersRegistered = false;

app.setAppUserModelId(APP_ID);

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 1100,
    minHeight: 700,
    autoHideMenuBar: true,
    backgroundColor: '#f3f1ea',
    icon: ICON_PATH,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  await window.loadURL(APP_URL);
  return window;
};

const setupAutoUpdates = () => {
  if (!app.isPackaged || updateHandlersRegistered) return;

  updateHandlersRegistered = true;

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.disableWebInstaller = true;
  autoUpdater.setFeedURL({
    provider: 'generic',
    url: UPDATE_URL,
  });

  autoUpdater.on('error', (error) => {
    console.error('Auto update error:', error);
  });

  autoUpdater.on('update-downloaded', async () => {
    const targetWindow = BrowserWindow.getFocusedWindow() || mainWindow;
    const result = await dialog.showMessageBox(targetWindow || undefined, {
      type: 'info',
      buttons: ['Перезапустить сейчас', 'Позже'],
      defaultId: 0,
      cancelId: 1,
      title: 'Обновление готово',
      message: 'Скачана новая версия PinIt.',
      detail: 'Приложение нужно перезапустить, чтобы установить обновление.',
    });

    if (result.response === 0) {
      autoUpdater.quitAndInstall();
    }
  });

  autoUpdater.checkForUpdatesAndNotify().catch((error) => {
    console.error('Failed to check for updates:', error);
  });
};

app.whenReady()
  .then(async () => {
    mainWindow = await createWindow();
    setupAutoUpdates();

    app.on('activate', async () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        mainWindow = await createWindow();
      }
    });
  })
  .catch((error) => {
    console.error(error);
    dialog.showErrorBox('PinIt desktop startup failed', String(error?.message || error));
    app.quit();
  });

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
