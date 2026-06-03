const { google } = require('googleapis');
const http = require('http');
const url = require('url');
const { saveToken, getToken, clearTokens, getLatestEmailDate, insertEmails, getEmailBody, getEmailAttachments, saveCalendarEvents, saveEmailBody, saveAttachments } = require('../db');

let oauth2Client;
let callbackServer;

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.labels',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const PORT = 3000;
const REDIRECT_URI = `http://localhost:${PORT}/oauth2callback`;

function initOAuth() {
  const clientId = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';

  oauth2Client = new google.auth.OAuth2(clientId, clientSecret, REDIRECT_URI);
}

function startCallbackServer(onCallback) {
  return new Promise((resolve, reject) => {
    if (callbackServer) {
      callbackServer.close();
    }

    callbackServer = http.createServer(async (req, res) => {
      const parsedUrl = url.parse(req.url, true);

      if (parsedUrl.pathname === '/oauth2callback' || parsedUrl.pathname === '/') {
        const code = parsedUrl.query.code;
        const error = parsedUrl.query.error;

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(getErrorPage(error));
          callbackServer.close();
          onCallback(null, new Error(error));
          return;
        }

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(getSuccessPage());
          callbackServer.close();
          callbackServer = null;
          onCallback(code, null);
        }
      } else if (parsedUrl.pathname === '/logout') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(getLogoutPage());
        callbackServer.close();
        callbackServer = null;
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    callbackServer.listen(PORT, () => {
      resolve();
    });

    callbackServer.on('error', (err) => {
      if (err.code === 'EADDRINUSE') {
        callbackServer.close();
        setTimeout(() => {
          startCallbackServer(onCallback).then(resolve).catch(reject);
        }, 1000);
      } else {
        reject(err);
      }
    });
  });
}

function getSuccessPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Connected - Analy</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          min-height: 100vh;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 20px;
        }
        .container {
          background: white;
          border-radius: 16px;
          padding: 48px 40px;
          max-width: 420px;
          width: 100%;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          animation: slideUp 0.4s ease;
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .icon-circle {
          width: 80px;
          height: 80px;
          background: linear-gradient(135deg, #22c55e, #16a34a);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 24px;
        }
        .icon-circle svg {
          width: 40px;
          height: 40px;
          stroke: white;
        }
        h1 { font-size: 24px; color: #1a1a2e; margin-bottom: 8px; }
        p { color: #6c757d; font-size: 15px; line-height: 1.5; margin-bottom: 24px; }
        .btn {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white;
          border: none;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 500;
          cursor: pointer;
          text-decoration: none;
        }
        .status-bar {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid #e9e9e7;
          font-size: 13px;
          color: #787774;
        }
        .status-dot { width: 8px; height: 8px; background: #22c55e; border-radius: 50%; }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="icon-circle">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
        </div>
        <h1>Connected Successfully!</h1>
        <p>Your Gmail account is now connected to Analy. You can close this window and return to the app.</p>
        <div class="status-bar">
          <div class="status-dot"></div>
          <span>Syncing your emails...</span>
        </div>
      </div>
    </body>
    </html>
  `;
}

function getErrorPage(error) {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Error - Analy</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:linear-gradient(135deg,#f87171 0%,#ef4444 100%); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
      .container { background:white; border-radius:16px; padding:48px 40px; max-width:420px; width:100%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
      .icon-circle { width:80px; height:80px; background:linear-gradient(135deg,#f87171,#ef4444); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; }
      h1 { font-size:24px; color:#1a1a2e; margin-bottom:8px; }
      p { color:#6c757d; font-size:15px; line-height:1.5; margin-bottom:24px; }
      .error-msg { background:#fef2f2; border:1px solid #fecaca; border-radius:8px; padding:12px 16px; font-family:monospace; font-size:13px; color:#991b1b; margin-bottom:20px; }
    </style></head>
    <body>
      <div class="container">
        <div class="icon-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></div>
        <h1>Authentication Failed</h1>
        <div class="error-msg">${error}</div>
        <p>Please try again or check your app configuration.</p>
      </div>
    </body>
    </html>
  `;
}

function getLogoutPage() {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Logged Out - Analy</title>
    <style>
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif; background:linear-gradient(135deg,#94a3b8 0%,#64748b 100%); min-height:100vh; display:flex; align-items:center; justify-content:center; padding:20px; }
      .container { background:white; border-radius:16px; padding:48px 40px; max-width:420px; width:100%; text-align:center; box-shadow:0 20px 60px rgba(0,0,0,0.3); }
      .icon-circle { width:80px; height:80px; background:linear-gradient(135deg,#94a3b8,#64748b); border-radius:50%; display:flex; align-items:center; justify-content:center; margin:0 auto 24px; }
      h1 { font-size:24px; color:#1a1a2e; margin-bottom:8px; }
      p { color:#6c757d; font-size:15px; }
    </style></head>
    <body>
      <div class="container">
        <div class="icon-circle"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg></div>
        <h1>Logged Out</h1>
        <p>Your account has been disconnected. You can close this window and return to the app.</p>
      </div>
    </body>
    </html>
  `;
}

async function getAuthUrl() {
  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent',
    redirect_uri: REDIRECT_URI,
  });
  return authUrl;
}

const AUTH_TIMEOUT_MS = 5 * 60 * 1000;

async function startOAuthFlow(openUrl) {
  return new Promise(async (resolve, reject) => {
    let timeoutId;
    try {
      await startCallbackServer(async (code, err) => {
        clearTimeout(timeoutId);
        if (err) return reject(err);
        try {
          await handleCallback(code);
          resolve({ success: true });
        } catch (callbackErr) {
          reject(callbackErr);
        }
      });

      timeoutId = setTimeout(() => {
        if (callbackServer) {
          callbackServer.close();
          callbackServer = null;
        }
        reject(new Error('OAuth flow timed out — user did not complete authentication'));
      }, AUTH_TIMEOUT_MS);

      const authUrl = await getAuthUrl();
      await openUrl(authUrl);
    } catch (err) {
      clearTimeout(timeoutId);
      reject(err);
    }
  });
}

async function handleCallback(code) {
  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);
  await saveToken(tokens);
  return { success: true };
}

async function isAuthenticated() {
  const token = await getToken();
  if (!token) return false;
  if (!token.access_token) return false;

  const now = Date.now();
  if (token.expiry_date && token.expiry_date < now) {
    try {
      await refreshToken();
      return true;
    } catch {
      return false;
    }
  }

  return true;
}

async function refreshToken() {
  const token = await getToken();
  if (!token || !token.refresh_token) {
    throw new Error('No refresh token available');
  }

  oauth2Client.setCredentials({
    refresh_token: token.refresh_token,
  });

  const { credentials } = await oauth2Client.refreshAccessToken();
  await saveToken(credentials);
  oauth2Client.setCredentials(credentials);
}

async function getAuthenticatedClient() {
  const token = await getToken();
  if (!token || !token.access_token) {
    throw new Error('Not authenticated');
  }

  const now = Date.now();
  if (token.expiry_date && token.expiry_date < now) {
    await refreshToken();
  }

  oauth2Client.setCredentials({
    access_token: token.access_token,
    refresh_token: token.refresh_token,
  });

  return oauth2Client;
}

async function fetchEmails(maxResults = 100, incremental = true) {
  const auth = await getAuthenticatedClient();
  const gmail = google.gmail({ version: 'v1', auth });

  let query = 'is:inbox';
  if (incremental) {
    const latestDate = await getLatestEmailDate();
    if (latestDate > 0) {
      const afterDate = new Date(latestDate + 1);
      const formattedDate = afterDate.toISOString().split('T')[0].replace(/-/g, '/');
      query += ` after:${formattedDate}`;
    } else {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
      const formattedDate = ninetyDaysAgo.toISOString().split('T')[0].replace(/-/g, '/');
      query += ` after:${formattedDate}`;
    }
  }

  let allMessages = [];
  let pageToken = null;

  do {
    const listResponse = await gmail.users.messages.list({
      userId: 'me',
      maxResults: 500,
      q: query,
      pageToken: pageToken,
    });

    const messages = listResponse.data.messages || [];
    allMessages = allMessages.concat(messages);
    pageToken = listResponse.data.nextPageToken;
  } while (pageToken && allMessages.length < maxResults);

  if (allMessages.length > maxResults) {
    allMessages = allMessages.slice(0, maxResults);
  }

  if (allMessages.length === 0) {
    return { count: 0, success: true, message: 'No new emails to fetch' };
  }

  const CONCURRENCY = 10;
  const emailResults = [];

  for (let i = 0; i < allMessages.length; i += CONCURRENCY) {
    const batch = allMessages.slice(i, i + CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(message =>
        gmail.users.messages.get({
          userId: 'me',
          id: message.id,
          format: 'metadata',
          metadataHeaders: ['From', 'To', 'Subject', 'Date'],
        })
      )
    );
    for (const result of settled) {
      if (result.status === 'rejected') {
        const err = result.reason;
        if (err.code === 404 || err.message?.includes('not found')) continue;
        throw err;
      }
      emailResults.push(result.value);
    }
  }

  const emails = emailResults.map(msg => {
    const headers = msg.data.payload.headers;
    const from = headers.find((h) => h.name === 'From')?.value || '';
    const to = headers.find((h) => h.name === 'To')?.value || '';
    const subject = headers.find((h) => h.name === 'Subject')?.value || '';

    const hasAttachments = (msg.data.labelIds || []).includes('ATTACHMENTS') ||
      (msg.data.payload?.parts || []).some(p => p.filename && p.filename.length > 0);

    return {
      id: msg.data.id,
      threadId: msg.data.threadId,
      sender: from,
      recipients: to,
      subject,
      snippet: msg.data.snippet || '',
      body: '',
      internalDate: parseInt(msg.data.internalDate),
      labels: msg.data.labelIds || [],
      hasAttachments,
      attachmentCount: 0,
      emailSize: msg.data.sizeEstimate || 0,
      accountId: 'primary',
    };
  });

  await insertEmails(emails);

  return { count: emails.length, success: true };
}

async function getFullEmailContent(emailId) {
  const body = await getEmailBody(emailId);
  const attachments = await getEmailAttachments(emailId);
  return { body, attachments };
}

async function fetchCalendarEvents() {
  try {
    const auth = await getAuthenticatedClient();
    const calendar = google.calendar({ version: 'v3', auth });
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 86400000);
    const weekAhead = new Date(now.getTime() + 7 * 86400000);

    const response = await calendar.events.list({
      calendarId: 'primary',
      timeMin: weekAgo.toISOString(),
      timeMax: weekAhead.toISOString(),
      maxResults: 50,
      singleEvents: true,
      orderBy: 'startTime',
    });

    const events = (response.data.items || []).map(event => ({
      id: event.id,
      accountId: 'primary',
      summary: event.summary || '',
      description: event.description || '',
      startTime: new Date(event.start?.dateTime || event.start?.date).getTime(),
      endTime: new Date(event.end?.dateTime || event.end?.date).getTime(),
      eventType: event.eventType || 'default',
      emailCount: 0,
    }));

    await saveCalendarEvents(events);
    return { count: events.length, success: true };
  } catch (err) {
    return { count: 0, success: false, error: err.message };
  }
}

async function fetchEmailById(emailId) {
  try {
    const auth = await getAuthenticatedClient();
    const gmail = google.gmail({ version: 'v1', auth });

    const msg = await gmail.users.messages.get({
      userId: 'me',
      id: emailId,
      format: 'full',
    });

    const parts = msg.data.payload.parts || [];
    let bodyText = '';
    const attachments = [];

    function extractParts(parts) {
      for (const part of parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data && !bodyText) {
          bodyText = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.filename && part.filename.length > 0) {
          attachments.push({
            filename: part.filename,
            mimeType: part.mimeType,
            size: part.body?.size || 0,
            attachmentId: part.body?.attachmentId || '',
          });
        }
        if (part.parts) extractParts(part.parts);
      }
    }
    extractParts(parts);

    if (msg.data.payload.body?.data && !bodyText) {
      bodyText = Buffer.from(msg.data.payload.body.data, 'base64').toString('utf-8');
    }

    if (bodyText) {
      await saveEmailBody(emailId, bodyText.substring(0, 100000), '');
    }
    if (attachments.length > 0) {
      await saveAttachments(emailId, attachments);
    }

    return {
      success: true,
      body: bodyText.substring(0, 100000),
      attachments,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function logout() {
  await clearTokens();
  return { success: true };
}

async function getLogoutUrl() {
  return `http://localhost:${PORT}/logout`;
}

module.exports = {
  initOAuth,
  getAuthUrl,
  startOAuthFlow,
  handleCallback,
  fetchEmails,
  isAuthenticated,
  logout,
  getLogoutUrl,
  getFullEmailContent,
  fetchCalendarEvents,
  fetchEmailById,
};
