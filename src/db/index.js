const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { app } = require('electron');

let db;

function getDb() {
  return db;
}

async function initDb() {
  const dbPath = path.join(app.getPath('userData'), 'emails.db');
  db = new sqlite3.Database(dbPath);

  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run(`
        CREATE TABLE IF NOT EXISTS emails (
          id TEXT PRIMARY KEY,
          thread_id TEXT,
          sender TEXT,
          recipients TEXT,
          subject TEXT,
          snippet TEXT,
          body TEXT,
          internal_date INTEGER,
          labels TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS oauth_tokens (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          access_token TEXT,
          refresh_token TEXT,
          expiry_date INTEGER
        )
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(internal_date)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender)
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS dashboard_widgets (
          id TEXT PRIMARY KEY,
          type TEXT DEFAULT 'chart',
          chart_type TEXT,
          title TEXT,
          data_source TEXT,
          width INTEGER DEFAULT 1,
          height INTEGER DEFAULT 1,
          position_x INTEGER DEFAULT 0,
          position_y INTEGER DEFAULT 0,
          config TEXT
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS job_applications (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          job_title TEXT NOT NULL,
          job_id TEXT,
          company_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'applied' CHECK(status IN ('applied', 'interview', 'rejected', 'accepted')),
          location TEXT,
          date_applied TEXT NOT NULL,
          notes TEXT,
          created_at TEXT DEFAULT (datetime('now'))
        )
      `);

      db.run("ALTER TABLE job_applications ADD COLUMN location TEXT", () => {});
    });

    db.on('open', () => resolve());
    db.on('error', (err) => reject(err));
  });
}

async function insertEmail(email) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO emails (id, thread_id, sender, recipients, subject, snippet, body, internal_date, labels)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        email.id,
        email.threadId,
        email.sender,
        email.recipients,
        email.subject,
        email.snippet,
        email.body,
        email.internalDate,
        JSON.stringify(email.labels || []),
      ],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes);
      }
    );
  });
}

async function insertEmails(emails) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO emails (id, thread_id, sender, recipients, subject, snippet, body, internal_date, labels)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      emails.forEach((email) => {
        stmt.run(
          [
            email.id,
            email.threadId,
            email.sender,
            email.recipients,
            email.subject,
            email.snippet,
            email.body,
            email.internalDate,
            JSON.stringify(email.labels || []),
          ]
        );
      });

      stmt.finalize();
      db.run('COMMIT', (err) => {
        if (err) return reject(err);
        resolve(emails.length);
      });
    });
  });
}

async function saveToken(tokenData) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO oauth_tokens (id, access_token, refresh_token, expiry_date)
       VALUES (1, ?, ?, ?)`,
      [tokenData.access_token, tokenData.refresh_token, tokenData.expiry_date],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

async function getToken() {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM oauth_tokens WHERE id = 1', (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function clearTokens() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM oauth_tokens WHERE id = 1', function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function clearEmails() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM emails', function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

function closeDb() {
  if (db) {
    db.close();
  }
}

async function saveDashboardWidgets(widgets) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run('DELETE FROM dashboard_widgets');

      const stmt = db.prepare(
        `INSERT INTO dashboard_widgets (id, type, chart_type, title, data_source, width, height, position_x, position_y, config)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      );

      widgets.forEach((widget) => {
        stmt.run([
          widget.id,
          widget.type || 'chart',
          widget.chartType,
          widget.title,
          widget.dataSource,
          widget.width || 1,
          widget.height || 1,
          widget.positionX || 0,
          widget.positionY || 0,
          JSON.stringify(widget.config || {}),
        ]);
      });

      stmt.finalize();
      db.run('COMMIT', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

async function getDashboardWidgets() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM dashboard_widgets ORDER BY position_y, position_x', (err, rows) => {
      if (err) return reject(err);
      resolve(rows.map(row => ({
        id: row.id,
        type: row.type,
        chartType: row.chart_type,
        title: row.title,
        dataSource: row.data_source,
        width: row.width,
        height: row.height,
        positionX: row.position_x,
        positionY: row.position_y,
        config: JSON.parse(row.config || '{}'),
      })));
    });
  });
}

async function getLatestEmailDate() {
  return new Promise((resolve, reject) => {
    db.get('SELECT MAX(internal_date) as latestDate FROM emails', (err, row) => {
      if (err) return reject(err);
      resolve(row.latestDate || 0);
    });
  });
}

async function getJobApplications() {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM job_applications ORDER BY date_applied DESC', (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function addJobApplication(app) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO job_applications (job_title, job_id, company_name, status, location, date_applied, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [app.job_title, app.job_id || null, app.company_name, app.status, app.location || null, app.date_applied, app.notes || null],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

async function updateJobApplication(id, app) {
  return new Promise((resolve, reject) => {
    db.run(
      `UPDATE job_applications SET job_title = ?, job_id = ?, company_name = ?, status = ?, location = ?, date_applied = ?, notes = ? WHERE id = ?`,
      [app.job_title, app.job_id || null, app.company_name, app.status, app.location || null, app.date_applied, app.notes || null, id],
      function (err) {
        if (err) return reject(err);
        resolve(this.changes > 0);
      }
    );
  });
}

async function clearJobApplications() {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM job_applications', function (err) {
      if (err) return reject(err);
      resolve(this.changes);
    });
  });
}

async function deleteJobApplication(id) {
  return new Promise((resolve, reject) => {
    db.run('DELETE FROM job_applications WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve(this.changes > 0);
    });
  });
}

module.exports = { initDb, closeDb, getDb, insertEmail, insertEmails, saveToken, getToken, clearTokens, clearEmails, saveDashboardWidgets, getDashboardWidgets, getLatestEmailDate, getJobApplications, addJobApplication, updateJobApplication, deleteJobApplication, clearJobApplications };
