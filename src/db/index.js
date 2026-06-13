const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const { encrypt, decryptWithFallback } = require('../server/crypto');

// Resolve the DB path from env (server mode) or Electron's userData (desktop mode).
function resolveDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const { app } = require('electron');
    return path.join(app.getPath('userData'), 'emails.db');
  } catch {
    // Non-Electron context (tests, server)
    return path.join(process.cwd(), 'data', 'emails.db');
  }
}

let db;

function getDb() {
  return db;
}

async function initDb() {
  const dbPath = resolveDbPath();
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
          labels TEXT,
          has_attachments INTEGER DEFAULT 0,
          attachment_count INTEGER DEFAULT 0,
          email_size INTEGER DEFAULT 0,
          account_id TEXT DEFAULT 'primary'
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS email_bodies (
          email_id TEXT PRIMARY KEY,
          body_text TEXT,
          body_html TEXT,
          FOREIGN KEY (email_id) REFERENCES emails(id)
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS attachments (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          email_id TEXT,
          filename TEXT,
          mime_type TEXT,
          size INTEGER,
          attachment_id TEXT,
          FOREIGN KEY (email_id) REFERENCES emails(id)
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
        CREATE TABLE IF NOT EXISTS accounts (
          id TEXT PRIMARY KEY,
          provider TEXT NOT NULL DEFAULT 'google',
          email TEXT,
          label TEXT,
          is_active INTEGER DEFAULT 0,
          created_at TEXT DEFAULT (datetime('now')),
          last_synced_at TEXT
        )
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_emails_date ON emails(internal_date)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_emails_subject ON emails(subject)
      `);

      db.run(`
        CREATE INDEX IF NOT EXISTS idx_emails_account ON emails(account_id)
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

      db.run(`
        CREATE TABLE IF NOT EXISTS ai_insights (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          title TEXT,
          content TEXT,
          data_snapshot TEXT,
          generated_at TEXT DEFAULT (datetime('now')),
          is_read INTEGER DEFAULT 0
        )
      `);

      db.run(`
        CREATE TABLE IF NOT EXISTS calendar_events (
          id TEXT PRIMARY KEY,
          account_id TEXT DEFAULT 'primary',
          summary TEXT,
          description TEXT,
          start_time INTEGER,
          end_time INTEGER,
          event_type TEXT,
          email_count INTEGER DEFAULT 0
        )
      `);

      db.run("ALTER TABLE emails ADD COLUMN has_attachments INTEGER DEFAULT 0", () => {});
      db.run("ALTER TABLE emails ADD COLUMN attachment_count INTEGER DEFAULT 0", () => {});
      db.run("ALTER TABLE emails ADD COLUMN email_size INTEGER DEFAULT 0", () => {});
      db.run("ALTER TABLE emails ADD COLUMN account_id TEXT DEFAULT 'primary'", () => {});
    });

    db.on('open', () => resolve());
    db.on('error', (err) => reject(err));
  });
}

async function insertEmail(email) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO emails (id, thread_id, sender, recipients, subject, snippet, body, internal_date, labels, has_attachments, attachment_count, email_size, account_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
        email.hasAttachments ? 1 : 0,
        email.attachmentCount || 0,
        email.emailSize || 0,
        email.accountId || 'primary',
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
        `INSERT OR REPLACE INTO emails (id, thread_id, sender, recipients, subject, snippet, body, internal_date, labels, has_attachments, attachment_count, email_size, account_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
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
            email.hasAttachments ? 1 : 0,
            email.attachmentCount || 0,
            email.emailSize || 0,
            email.accountId || 'primary',
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

async function saveEmailBody(emailId, bodyText, bodyHtml) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO email_bodies (email_id, body_text, body_html) VALUES (?, ?, ?)`,
      [emailId, bodyText, bodyHtml],
      function (err) {
        if (err) return reject(err);
        resolve();
      }
    );
  });
}

async function getEmailBody(emailId) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM email_bodies WHERE email_id = ?', [emailId], (err, row) => {
      if (err) return reject(err);
      resolve(row);
    });
  });
}

async function getAttachmentStats() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT COUNT(*) as total_attachments, SUM(size) as total_size, mime_type
       FROM attachments GROUP BY mime_type ORDER BY total_attachments DESC`,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

async function saveAttachments(emailId, attachments) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      db.run('DELETE FROM attachments WHERE email_id = ?', [emailId]);
      const stmt = db.prepare(
        `INSERT INTO attachments (email_id, filename, mime_type, size, attachment_id) VALUES (?, ?, ?, ?, ?)`
      );
      (attachments || []).forEach(a => {
        stmt.run([emailId, a.filename, a.mimeType, a.size, a.attachmentId]);
      });
      stmt.finalize();
      db.run('COMMIT', (err) => {
        if (err) return reject(err);
        resolve();
      });
    });
  });
}

async function getEmailAttachments(emailId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM attachments WHERE email_id = ?', [emailId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function saveToken(tokenData) {
  // Encrypt sensitive token fields before persisting.
  // expiry_date is not secret but we keep it plaintext for easy TTL queries.
  let encAccessToken, encRefreshToken;
  try {
    encAccessToken  = encrypt(tokenData.access_token);
    encRefreshToken = encrypt(tokenData.refresh_token);
  } catch {
    // ENCRYPTION_KEY not set (e.g. development without .env) — store plaintext
    // and emit a warning so operators notice.
    console.warn('[db] ENCRYPTION_KEY not set — storing OAuth tokens as plaintext');
    encAccessToken  = tokenData.access_token;
    encRefreshToken = tokenData.refresh_token;
  }

  return new Promise((resolve, reject) => {
    db.run(
      `INSERT OR REPLACE INTO oauth_tokens (id, access_token, refresh_token, expiry_date)
       VALUES (1, ?, ?, ?)`,
      [encAccessToken, encRefreshToken, tokenData.expiry_date],
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
      if (!row) return resolve(null);
      try {
        // decryptWithFallback handles: encrypted (current key), encrypted (prev key),
        // or plaintext (legacy rows written before encryption was added).
        resolve({
          ...row,
          access_token:  decryptWithFallback(row.access_token),
          refresh_token: decryptWithFallback(row.refresh_token),
        });
      } catch (decErr) {
        // Token is corrupted or key was rotated without a ENCRYPTION_KEY_PREV fallback.
        // Return null so the caller treats this as unauthenticated.
        console.error('[db] Failed to decrypt OAuth tokens — user will need to re-authenticate:', decErr.message);
        resolve(null);
      }
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

async function getEmailsByThread(threadId) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM emails WHERE thread_id = ? ORDER BY internal_date ASC', [threadId], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function searchEmails(query, filters = {}) {
  return new Promise((resolve, reject) => {
    let sql = 'SELECT id, subject, sender, snippet, internal_date, labels, has_attachments FROM emails WHERE 1=1';
    const params = [];

    if (query) {
      sql += ' AND (subject LIKE ? OR sender LIKE ? OR snippet LIKE ? OR body LIKE ?)';
      const like = `%${query}%`;
      params.push(like, like, like, like);
    }

    if (filters.sender) {
      sql += ' AND sender LIKE ?';
      params.push(`%${filters.sender}%`);
    }

    if (filters.dateFrom) {
      sql += ' AND internal_date >= ?';
      params.push(new Date(filters.dateFrom).getTime());
    }

    if (filters.dateTo) {
      sql += ' AND internal_date <= ?';
      params.push(new Date(filters.dateTo + 'T23:59:59').getTime());
    }

    if (filters.hasAttachments) {
      sql += ' AND has_attachments = 1';
    }

    if (filters.label) {
      sql += ' AND labels LIKE ?';
      params.push(`%${filters.label}%`);
    }

    if (filters.accountId) {
      sql += ' AND account_id = ?';
      params.push(filters.accountId);
    }

    if (filters.category) {
      sql += ' AND category = ?';
      params.push(filters.category);
    }

    sql += ' ORDER BY internal_date DESC LIMIT ?';
    params.push(filters.limit || 100);

    db.all(sql, params, (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
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

async function saveAiInsight(insight) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO ai_insights (type, title, content, data_snapshot) VALUES (?, ?, ?, ?)`,
      [insight.type, insight.title, insight.content, insight.dataSnapshot || null],
      function (err) {
        if (err) return reject(err);
        resolve({ id: this.lastID });
      }
    );
  });
}

async function getAiInsights(limit = 20) {
  return new Promise((resolve, reject) => {
    db.all('SELECT * FROM ai_insights ORDER BY generated_at DESC LIMIT ?', [limit], (err, rows) => {
      if (err) return reject(err);
      resolve(rows);
    });
  });
}

async function markInsightRead(id) {
  return new Promise((resolve, reject) => {
    db.run('UPDATE ai_insights SET is_read = 1 WHERE id = ?', [id], function (err) {
      if (err) return reject(err);
      resolve();
    });
  });
}

async function saveCalendarEvents(events) {
  return new Promise((resolve, reject) => {
    db.serialize(() => {
      db.run('BEGIN TRANSACTION');
      const stmt = db.prepare(
        `INSERT OR REPLACE INTO calendar_events (id, account_id, summary, description, start_time, end_time, event_type, email_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      );
      events.forEach(e => {
        stmt.run([e.id, e.accountId || 'primary', e.summary, e.description, e.startTime, e.endTime, e.eventType, e.emailCount || 0]);
      });
      stmt.finalize();
      db.run('COMMIT', (err) => {
        if (err) return reject(err);
        resolve(events.length);
      });
    });
  });
}

async function getCalendarEvents(dateFrom, dateTo) {
  return new Promise((resolve, reject) => {
    db.all(
      'SELECT * FROM calendar_events WHERE start_time >= ? AND start_time <= ? ORDER BY start_time',
      [dateFrom, dateTo],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

async function getCalendarEmailCorrelation() {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DATE(c.start_time / 1000, 'unixepoch') as date,
              COUNT(c.id) as event_count,
              COUNT(e.id) as email_count
       FROM calendar_events c
       LEFT JOIN emails e ON DATE(e.internal_date / 1000, 'unixepoch') = DATE(c.start_time / 1000, 'unixepoch')
       GROUP BY date
       ORDER BY date DESC
       LIMIT 30`,
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

async function getDashStats() {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT
        COUNT(*) as total_emails,
        COUNT(DISTINCT sender) as unique_senders,
        SUM(has_attachments) as emails_with_attachments,
        SUM(attachment_count) as total_attachments,
        AVG(email_size) as avg_email_size
      FROM emails`,
      (err, row) => {
        if (err) return reject(err);
        resolve(row);
      }
    );
  });
}

async function getDailyEmailVolume(days = 30) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT DATE(internal_date / 1000, 'unixepoch') as date,
              COUNT(*) as count,
              SUM(has_attachments) as attachments,
              AVG(email_size) as avg_size
       FROM emails
       WHERE internal_date > ?
       GROUP BY date
       ORDER BY date DESC
       LIMIT ?`,
      [Date.now() - days * 86400000, days],
      (err, rows) => {
        if (err) return reject(err);
        resolve(rows);
      }
    );
  });
}

async function getEmailById(id) {
  return new Promise((resolve, reject) => {
    db.get('SELECT * FROM emails WHERE id = ?', [id], (err, row) => {
      if (err) return reject(err);
      if (row) {
        row.labels = JSON.parse(row.labels || '[]');
      }
      resolve(row);
    });
  });
}

module.exports = {
  initDb, closeDb, getDb,
  insertEmail, insertEmails,
  saveEmailBody, getEmailBody,
  saveAttachments, getEmailAttachments, getAttachmentStats,
  saveToken, getToken, clearTokens, clearEmails,
  saveDashboardWidgets, getDashboardWidgets,
  getLatestEmailDate,
  getEmailsByThread,
  searchEmails,
  getJobApplications, addJobApplication, updateJobApplication, deleteJobApplication, clearJobApplications,
  saveAiInsight, getAiInsights, markInsightRead,
  saveCalendarEvents, getCalendarEvents, getCalendarEmailCorrelation,
  getDashStats, getDailyEmailVolume, getEmailById,
};
