const { ipcMain, shell, dialog } = require('electron');
const { getMainWindow } = require('./window');
const { clearEmails, saveDashboardWidgets, getDashboardWidgets, getJobApplications, addJobApplication, updateJobApplication, deleteJobApplication, clearJobApplications, getDb, searchEmails, getEmailById, getEmailsByThread, getEmailBody, getEmailAttachments, getAttachmentStats, saveAiInsight, getAiInsights, markInsightRead, getCalendarEvents, getCalendarEmailCorrelation, getDashStats, getDailyEmailVolume } = require('../db');
const { startOAuthFlow, fetchEmails, isAuthenticated, logout, getFullEmailContent, fetchCalendarEvents, fetchEmailById } = require('../auth');
const { analyzeEmails, analyzeJobApplications, classifyJobEmails, generateProactiveInsights } = require('../ai');
const { reloadAllClassifiers, loadTrainingData, saveTrainingData } = require('../ml');
const fs = require('fs');
const path = require('path');

function wrapHandler(fn) {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      console.error(`IPC Error: ${err.message}`, err.stack);
      return { success: false, error: err.message };
    }
  };
}

function registerIpcHandlers() {
  ipcMain.handle('start-oauth-flow', wrapHandler(async () => {
    await startOAuthFlow((url) => shell.openExternal(url));
    return { success: true };
  }));

  ipcMain.handle('check-auth', wrapHandler(async () => {
    return await isAuthenticated();
  }));

  ipcMain.handle('fetch-emails', wrapHandler(async (_event, incremental = true) => {
    return await fetchEmails(100, incremental);
  }));

  ipcMain.handle('fetch-full-email', wrapHandler(async (_event, emailId) => {
    return await fetchEmailById(emailId);
  }));

  ipcMain.handle('get-email-detail', wrapHandler(async (_event, emailId) => {
    const email = await getEmailById(emailId);
    if (!email) return { success: false, error: 'Email not found' };
    const body = await getEmailBody(emailId);
    const attachments = await getEmailAttachments(emailId);
    const thread = await getEmailsByThread(email.thread_id);
    return { success: true, email, body, attachments, thread };
  }));

  ipcMain.handle('get-email-stats', wrapHandler(async () => {
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
  }));

  ipcMain.handle('get-emails-by-date', wrapHandler(async () => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT DATE(internal_date / 1000, 'unixepoch') as date, COUNT(*) as count
         FROM emails GROUP BY date ORDER BY date DESC LIMIT 30`,
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  }));

  ipcMain.handle('get-senders-stats', wrapHandler(async () => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT sender, COUNT(*) as count FROM emails GROUP BY sender ORDER BY count DESC LIMIT 10`,
        (err, rows) => {
          if (err) return reject(err);
          resolve(rows);
        }
      );
    });
  }));

  ipcMain.handle('get-hourly-distribution', wrapHandler(async () => {
    const db = getDb();
    return new Promise((resolve, reject) => {
      db.all(
        `SELECT CAST(strftime('%H', datetime(internal_date / 1000, 'unixepoch')) AS INTEGER) as hour, COUNT(*) as count
         FROM emails GROUP BY hour ORDER BY hour`,
        (err, rows) => {
          if (err) return reject(err);
          const hourly = Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
          rows.forEach(row => { hourly[row.hour].count = row.count; });
          resolve(hourly);
        }
      );
    });
  }));

  ipcMain.handle('search-emails', wrapHandler(async (_event, query, filters = {}) => {
    return await searchEmails(query, filters);
  }));

  ipcMain.handle('analyze-emails', wrapHandler(async () => {
    return await analyzeEmails();
  }));

  ipcMain.handle('submit-prompt', wrapHandler(async (_event, prompt) => {
    const db = getDb();
    const emails = await new Promise((resolve, reject) => {
      db.all('SELECT subject, sender, snippet, labels, internal_date FROM emails LIMIT 50', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    return await analyzeEmails(prompt, emails);
  }));

  ipcMain.handle('logout', wrapHandler(async () => {
    await logout();
    await clearEmails();
    await clearJobApplications();
    return { success: true };
  }));

  ipcMain.handle('save-dashboard-widgets', wrapHandler(async (_event, widgets) => {
    await saveDashboardWidgets(widgets);
    return { success: true };
  }));

  ipcMain.handle('get-dashboard-widgets', wrapHandler(async () => {
    return await getDashboardWidgets();
  }));

  ipcMain.handle('get-job-applications', wrapHandler(async () => {
    return await getJobApplications();
  }));

  ipcMain.handle('add-job-application', wrapHandler(async (_event, app) => {
    return await addJobApplication(app);
  }));

  ipcMain.handle('update-job-application', wrapHandler(async (_event, id, app) => {
    return await updateJobApplication(id, app);
  }));

  ipcMain.handle('delete-job-application', wrapHandler(async (_event, id) => {
    return await deleteJobApplication(id);
  }));

  ipcMain.handle('analyze-job-applications', wrapHandler(async () => {
    const apps = await getJobApplications();
    return analyzeJobApplications(apps);
  }));

  ipcMain.handle('scan-job-emails', wrapHandler(async () => {
    const db = getDb();
    const emails = await new Promise((resolve, reject) => {
      db.all('SELECT id, subject, sender, snippet, internal_date FROM emails ORDER BY internal_date DESC LIMIT 200', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    return classifyJobEmails(emails);
  }));

  ipcMain.handle('get-dash-stats', wrapHandler(async () => {
    return await getDashStats();
  }));

  ipcMain.handle('get-daily-volume', wrapHandler(async (_event, days = 30) => {
    return await getDailyEmailVolume(days);
  }));

  ipcMain.handle('export-data', wrapHandler(async (_event, format = 'csv') => {
    const db = getDb();
    const emails = await new Promise((resolve, reject) => {
      db.all('SELECT * FROM emails ORDER BY internal_date DESC', (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      });
    });
    const { cancel, filePath } = await dialog.showSaveDialog({
      title: 'Export Email Data',
      defaultPath: `analy-export-${Date.now()}.${format}`,
      filters: [
        { name: format === 'csv' ? 'CSV' : 'JSON', extensions: [format] },
      ],
    });
    if (cancel || !filePath) return { success: false, error: 'Export cancelled' };

    if (format === 'csv') {
      const headers = 'id,thread_id,sender,recipients,subject,snippet,internal_date,labels,has_attachments,attachment_count,email_size\n';
      const rows = emails.map(e =>
        `"${e.id}","${e.thread_id}","${(e.sender || '').replace(/"/g, '""')}","${(e.recipients || '').replace(/"/g, '""')}","${(e.subject || '').replace(/"/g, '""')}","${(e.snippet || '').replace(/"/g, '""')}",${e.internal_date},"${e.labels || ''}",${e.has_attachments || 0},${e.attachment_count || 0},${e.email_size || 0}`
      ).join('\n');
      fs.writeFileSync(filePath, headers + rows, 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(emails, null, 2), 'utf-8');
    }
    return { success: true, filePath };
  }));

  ipcMain.handle('export-job-applications', wrapHandler(async (_event, format = 'csv') => {
    const apps = await getJobApplications();
    const { cancel, filePath } = await dialog.showSaveDialog({
      title: 'Export Job Applications',
      defaultPath: `analy-jobs-export-${Date.now()}.${format}`,
      filters: [{ name: format === 'csv' ? 'CSV' : 'JSON', extensions: [format] }],
    });
    if (cancel || !filePath) return { success: false, error: 'Export cancelled' };

    if (format === 'csv') {
      const headers = 'id,job_title,job_id,company_name,status,location,date_applied,notes,created_at\n';
      const rows = apps.map(a =>
        `"${a.id}","${(a.job_title || '').replace(/"/g, '""')}","${(a.job_id || '').replace(/"/g, '""')}","${(a.company_name || '').replace(/"/g, '""')}","${a.status}","${(a.location || '').replace(/"/g, '""')}","${a.date_applied}","${(a.notes || '').replace(/"/g, '""')}","${a.created_at || ''}"`
      ).join('\n');
      fs.writeFileSync(filePath, headers + rows, 'utf-8');
    } else {
      fs.writeFileSync(filePath, JSON.stringify(apps, null, 2), 'utf-8');
    }
    return { success: true, filePath };
  }));

  ipcMain.handle('get-ai-insights', wrapHandler(async () => {
    return await getAiInsights();
  }));

  ipcMain.handle('generate-proactive-insights', wrapHandler(async () => {
    return await generateProactiveInsights();
  }));

  ipcMain.handle('get-training-data', wrapHandler(async () => {
    const categories = loadTrainingData('email-categories.json');
    const intents = loadTrainingData('intents.json');
    const jobEmails = loadTrainingData('job-emails.json');
    return { success: true, data: { categories, intents, jobEmails } };
  }));

  ipcMain.handle('save-training-data', wrapHandler(async (_event, type, data) => {
    const filenames = {
      categories: 'email-categories.json',
      intents: 'intents.json',
      jobEmails: 'job-emails.json',
    };
    const filename = filenames[type];
    if (!filename) throw new Error('Invalid training data type');
    saveTrainingData(filename, data);
    reloadAllClassifiers();
    return { success: true };
  }));

  ipcMain.handle('fetch-calendar-events', wrapHandler(async () => {
    return await fetchCalendarEvents();
  }));

  ipcMain.handle('get-calendar-events', wrapHandler(async (_event, dateFrom, dateTo) => {
    return await getCalendarEvents(dateFrom, dateTo);
  }));

  ipcMain.handle('get-calendar-correlation', wrapHandler(async () => {
    return await getCalendarEmailCorrelation();
  }));
}

module.exports = { registerIpcHandlers };
