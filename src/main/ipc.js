const { ipcMain, shell } = require('electron');
const { getMainWindow } = require('./window');
const { clearEmails, saveDashboardWidgets, getDashboardWidgets, getJobApplications, addJobApplication, updateJobApplication, deleteJobApplication, clearJobApplications, getDb } = require('../db');
const { startOAuthFlow, fetchEmails, isAuthenticated, logout } = require('../auth');
const { analyzeEmails, analyzeJobApplications, classifyJobEmails } = require('../ai');

function registerIpcHandlers() {
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
    const db = getDb();
    const total = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(*) as total FROM emails', (err, row) => {
        if (err) return reject(err);
        resolve(row.total);
      });
    });
    const uniqueSenders = await new Promise((resolve, reject) => {
      db.get('SELECT COUNT(DISTINCT sender) as uniqueSenders FROM emails', (err, row) => {
        if (err) return reject(err);
        resolve(row.uniqueSenders);
      });
    });
    return { total, uniqueSenders };
  });

  ipcMain.handle('get-emails-by-date', async () => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(internal_date / 1000, 'unixepoch') as date, COUNT(*) as count
         FROM emails
         GROUP BY date
         ORDER BY date DESC
         LIMIT 30`,
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  });

  ipcMain.handle('get-senders-stats', async () => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT sender, COUNT(*) as count
         FROM emails
         GROUP BY sender
         ORDER BY count DESC
         LIMIT 10`,
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  });

  ipcMain.handle('get-hourly-distribution', async () => {
    const db = getDb();
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
          resolve(hourly);
        }
      );
    });
  });

  ipcMain.handle('analyze-emails', async () => {
    return await analyzeEmails();
  });

  ipcMain.handle('submit-prompt', async (_event, prompt) => {
    const db = getDb();
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
    await clearJobApplications();
    return { success: true };
  });

  ipcMain.handle('save-dashboard-widgets', async (_event, widgets) => {
    await saveDashboardWidgets(widgets);
    return { success: true };
  });

  ipcMain.handle('get-dashboard-widgets', async () => {
    return await getDashboardWidgets();
  });

  ipcMain.handle('get-job-applications', async () => {
    return await getJobApplications();
  });

  ipcMain.handle('add-job-application', async (_event, app) => {
    return await addJobApplication(app);
  });

  ipcMain.handle('update-job-application', async (_event, id, app) => {
    return await updateJobApplication(id, app);
  });

  ipcMain.handle('delete-job-application', async (_event, id) => {
    return await deleteJobApplication(id);
  });

  ipcMain.handle('analyze-job-applications', async () => {
    const apps = await getJobApplications();
    return analyzeJobApplications(apps);
  });

  ipcMain.handle('scan-job-emails', async () => {
    const db = getDb();
    const emails = await new Promise((resolve, reject) => {
      db.all('SELECT id, subject, sender, snippet, internal_date FROM emails ORDER BY internal_date DESC LIMIT 200', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    return classifyJobEmails(emails);
  });
}

module.exports = { registerIpcHandlers };
