require('dotenv').config();
const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { initDb, closeDb, clearEmails, saveDashboardWidgets, getDashboardWidgets } = require('./src/db');
const { initOAuth, startOAuthFlow, fetchEmails, isAuthenticated, logout } = require('./src/oauth');
const { analyzeEmails } = require('./src/ai');

let mainWindow;

function createWindow() {
  const windowConfig = {
    width: 1200,
    height: 800,
    icon: path.join(__dirname, 'src/img/analy_logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  };

  if (process.platform === 'darwin') {
    windowConfig.titleBarStyle = 'hiddenInset';
    windowConfig.roundedCorners = true;
    windowConfig.vibrancy = 'under-window';
    windowConfig.transparent = false;
  }

  mainWindow = new BrowserWindow(windowConfig);
  mainWindow.loadFile('src/index.html');
}

app.whenReady().then(async () => {
  app.setName('Analy');

  if (process.platform === 'darwin') {
    app.dock.setIcon(path.join(__dirname, 'src/img/analy_logo.png'));
  }

  await initDb();
  initOAuth();

  ipcMain.handle('start-oauth-flow', async () => {
    try {
      await startOAuthFlow((url) => shell.openExternal(url));
      return { success: true };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('check-auth', async () => {
    return await isAuthenticated();
  });

  ipcMain.handle('fetch-emails', async (_event, incremental = true) => {
    return await fetchEmails(100, incremental);
  });

  ipcMain.handle('get-email-stats', async () => {
    console.log('[DB READ] get-email-stats');
    const db = require('./src/db').getDb();
    const total = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM emails', (err, row) => {
        if (err) return reject(err);
        console.log('[DB RESULT] Total emails:', row.total);
        resolve(row.total);
      });
    });
    const uniqueSenders = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(DISTINCT sender) as uniqueSenders FROM emails', (err, row) => {
        if (err) return reject(err);
        console.log('[DB RESULT] Unique senders:', row.uniqueSenders);
        resolve(row.uniqueSenders);
      });
    });
    return { total, uniqueSenders };
  });

  ipcMain.handle('get-emails-by-date', async () => {
    console.log('[DB READ] get-emails-by-date');
    const db = require('./src/db').getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(internal_date / 1000, 'unixepoch') as date, COUNT(*) as count
         FROM emails
         GROUP BY date
         ORDER BY date DESC
         LIMIT 30`,
        (err, rows) => {
          if (err) return reject(err);
          console.log('[DB RESULT] Emails by date:', rows.length, 'days');
          resolve(rows);
        }
      );
    });
  });

  ipcMain.handle('get-senders-stats', async () => {
    console.log('[DB READ] get-senders-stats');
    const db = require('./src/db').getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT sender, COUNT(*) as count
         FROM emails
         GROUP BY sender
         ORDER BY count DESC
         LIMIT 10`,
        (err, rows) => {
          if (err) return reject(err);
          console.log('[DB RESULT] Top senders:', rows.length, 'senders');
          resolve(rows);
        }
      );
    });
  });

  ipcMain.handle('get-hourly-distribution', async () => {
    console.log('[DB READ] get-hourly-distribution');
    const db = require('./src/db').getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT CAST(strftime('%H', datetime(internal_date / 1000, 'unixepoch')) AS INTEGER) as hour, COUNT(*) as count
         FROM emails
         GROUP BY hour
         ORDER BY hour`,
        (err, rows) => {
          if (err) return reject(err);
          const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
          rows.forEach(row => {
            hourly[row.hour].count = row.count;
          });
          console.log('[DB RESULT] Hourly distribution:', hourly.filter(h => h.count > 0).length, 'hours with data');
          resolve(hourly);
        }
      );
    });
  });

  ipcMain.handle('analyze-emails', async () => {
    return await analyzeEmails();
  });

  ipcMain.handle('submit-prompt', async (_event, prompt) => {
    const db = require('./src/db').getDb();
    const emails = await new Promise((resolve, reject) => {
      db.all('SELECT subject, sender, snippet FROM emails LIMIT 50', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    return await analyzeEmails(prompt, emails);
  });

  ipcMain.handle('logout', async () => {
    await logout();
    await clearEmails();
    return { success: true };
  });

  ipcMain.handle('save-dashboard-widgets', async (_event, widgets) => {
    await saveDashboardWidgets(widgets);
    return { success: true };
  });

  ipcMain.handle('get-dashboard-widgets', async () => {
    return await getDashboardWidgets();
  });

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
