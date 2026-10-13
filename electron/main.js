'use strict';

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { pathToFileURL } = require('url');
const { createStorage } = require('./storage');
const { focusWindow, isExpectedAppUrl, isTrustedRenderer } = require('./security');
const { configureE2EUserData } = require('./e2e-config');

let storage;
let mainWindow;
const appPageUrl = pathToFileURL(path.join(__dirname, '..', 'index.html')).href;

function isTrustedWellnessRenderer(event) {
  return Boolean(storage && isTrustedRenderer(event, mainWindow, appPageUrl));
}

function createWindow() {
  mainWindow = new BrowserWindow({
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!isExpectedAppUrl(url, appPageUrl)) event.preventDefault();
  });
  mainWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));

  mainWindow.loadURL(appPageUrl);
}

let startupConfiguration;
try {
  startupConfiguration = configureE2EUserData({
    app,
    productionUserDataDirectory: app.getPath('userData'),
  });
} catch (error) {
  console.error(`Wellness Tracker could not start: ${error.message}`);
  app.exit(1);
}

if (startupConfiguration) {
  const hasSingleInstanceLock = app.requestSingleInstanceLock();

  if (!hasSingleInstanceLock) {
    app.quit();
  } else {
    app.on('second-instance', () => {
      focusWindow(mainWindow);
    });

    app.whenReady().then(() => {
      storage = createStorage({ directory: app.getPath('userData') });

      ipcMain.handle('wellness:loadEntries', event => {
        if (!isTrustedWellnessRenderer(event)) {
          throw new Error('Untrusted renderer.');
        }
        return storage.loadEntries();
      });

      ipcMain.handle('wellness:saveEntries', (event, entries) => {
        if (!isTrustedWellnessRenderer(event)) {
          throw new Error('Untrusted renderer.');
        }
        return storage.saveEntries(entries);
      });

      createWindow();

      app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
      });
    });

    app.on('window-all-closed', () => {
      if (process.platform !== 'darwin') app.quit();
    });
  }
}
