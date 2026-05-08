require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const { initDb, closeDb } = require('./src/db');
const { initOAuth } = require('./src/auth');
const { createWindow, setupDockIcon } = require('./src/main/window');
const { registerIpcHandlers } = require('./src/main/ipc');

app.whenReady().then(async () => {
  app.setName('Analy');

  setupDockIcon();
  await initDb();
  initOAuth();
  registerIpcHandlers();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  closeDb();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
