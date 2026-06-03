require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const { initDb, closeDb } = require('./src/db');
const { initOAuth, fetchEmails, isAuthenticated } = require('./src/auth');
const { createWindow, setupDockIcon, getMainWindow } = require('./src/main/window');
const { registerIpcHandlers } = require('./src/main/ipc');
const { generateProactiveInsights } = require('./src/ai');
const { initClassifiers } = require('./src/ml');

let autoRefreshInterval = null;

function startAutoRefresh() {
  if (autoRefreshInterval) clearInterval(autoRefreshInterval);
  autoRefreshInterval = setInterval(async () => {
    try {
      const authenticated = await isAuthenticated();
      if (!authenticated) return;
      const result = await fetchEmails(true);
      if (result.count > 0) {
        const mainWindow = getMainWindow();
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('emails-synced', { count: result.count });
        }
      }
      generateProactiveInsights();
    } catch (err) {
      console.error('Auto-refresh error:', err.message);
    }
  }, 300000);
}

function stopAutoRefresh() {
  if (autoRefreshInterval) {
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

app.whenReady().then(async () => {
  app.setName('Analy');

  setupDockIcon();
  await initDb();
  initOAuth();
  registerIpcHandlers();
  createWindow();
  startAutoRefresh();
  setImmediate(() => initClassifiers());

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  app.on('before-quit', () => {
    stopAutoRefresh();
  });
});

app.on('window-all-closed', () => {
  stopAutoRefresh();
  closeDb();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
