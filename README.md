# Analy — Email Analytics Platform

> Gmail-powered email analytics with local ML classification, job-application tracking, calendar correlation, and a production-ready REST API for cloud deployment.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Quick Start — Desktop (Electron)](#quick-start--desktop-electron)
4. [Quick Start — Cloud API (Docker)](#quick-start--cloud-api-docker)
5. [Environment Variables](#environment-variables)
6. [Security Architecture](#security-architecture)
   - [Encryption at Rest](#encryption-at-rest)
   - [JWT Authentication](#jwt-authentication)
   - [Application Gateway (nginx)](#application-gateway-nginx)
7. [API Reference](#api-reference)
   - [Authentication](#authentication-endpoints)
   - [Emails](#email-endpoints)
   - [Analytics](#analytics-endpoints)
   - [Job Applications](#job-application-endpoints)
8. [Database Schema](#database-schema)
9. [ML Classification](#ml-classification)
10. [Key Rotation](#key-rotation)
11. [Deploying to Cloud](#deploying-to-cloud)
12. [Development](#development)

---

## Overview

Analy connects to your Gmail account via Google OAuth 2.0 and provides:

- **Dashboard** — daily email volume, top senders, hourly distribution, attachment stats
- **Inbox search** — full-text search with filters (sender, date range, labels, category, attachments)
- **AI analysis** — intent-based prompt queries ("who emails me most?", "show my newsletters")
- **Job tracker** — track applications; ML auto-scans your inbox to detect job-related emails
- **Calendar correlation** — overlay calendar events against email volume
- **Proactive insights** — anomaly detection on volume changes, weekly summaries

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      DESKTOP (Electron)                         │
│                                                                 │
│  Renderer (HTML/JS) ──IPC──► main.js ──► src/main/ipc.js       │
│                                              │                  │
│                              ┌───────────────┼──────────────┐   │
│                              ▼               ▼              ▼   │
│                           src/db        src/auth        src/ai  │
│                          (SQLite)    (Google OAuth)   (analysis) │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                       CLOUD (Docker)                            │
│                                                                 │
│  Internet ──HTTPS──► nginx (gateway) ──HTTP──► Express API      │
│                        • TLS 1.3                 (port 4000)    │
│                        • Rate limiting               │          │
│                        • Security headers  ┌─────────┼──────┐  │
│                        • CORS              ▼         ▼      ▼  │
│                                         src/db   src/auth src/ai│
│                                        (SQLite)  (OAuth)       │
└─────────────────────────────────────────────────────────────────┘
```

### Module map

| Path | Role |
|---|---|
| `main.js` | Electron entry point — window, lifecycle, auto-refresh |
| `src/main/ipc.js` | Electron IPC handler registration |
| `src/main/window.js` | BrowserWindow factory |
| `src/db/index.js` | SQLite CRUD (works in both Electron and server contexts) |
| `src/auth/index.js` | Google OAuth 2.0 flow, Gmail + Calendar API, token refresh |
| `src/ai/index.js` | Intent routing and email/job analysis |
| `src/ml/index.js` | Lazy-loaded ML classifiers (email category, intent, job emails) |
| `src/server/index.js` | **Express API server** — cloud entry point |
| `src/server/crypto.js` | AES-256-GCM encryption for tokens at rest |
| `src/server/middleware/auth.js` | JWT issue / verify (HS256, zero external deps) |
| `src/server/middleware/validate.js` | Lightweight request validation |
| `src/server/routes/` | Route handlers mirroring all IPC handlers |
| `deploy/nginx.conf` | nginx application gateway config |
| `deploy/Dockerfile` | Multi-stage Docker image (non-root) |
| `deploy/docker-compose.yml` | Full production stack |

---

## Quick Start — Desktop (Electron)

### Prerequisites

- Node.js 20+
- A Google Cloud project with the **Gmail API** and **Google Calendar API** enabled
- OAuth 2.0 credentials of type **Desktop application**

### Steps

```bash
# 1. Clone and install
git clone https://github.com/kennyrobert88/analy.git
cd analy
npm install

# 2. Rebuild native modules for your architecture (Apple Silicon: arm64)
npm run rebuild

# 3. Configure credentials
cp .env.example .env
#    Edit .env and add:
#      GOOGLE_CLIENT_ID=...
#      GOOGLE_CLIENT_SECRET=...

# 4. Launch
npm start
```

The app will open and guide you through Google OAuth on first run.

---

## Quick Start — Cloud API (Docker)

### Prerequisites

- Docker 24+ and Docker Compose v2
- The same Google Cloud credentials as above
- A domain name (or `localhost` for staging)

```bash
# 1. Generate secrets
npm run gen-key          # prints ENCRYPTION_KEY=...
npm run gen-jwt-secret   # prints JWT_SECRET=...

# 2. Create production env file
cp .env.production.example .env.production
#    Fill in ENCRYPTION_KEY, JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, ALLOWED_ORIGINS

# 3. Generate a self-signed TLS certificate (staging/dev only)
sh deploy/gen-dev-certs.sh
#    For production: replace deploy/ssl/analy.crt + analy.key with a Let's Encrypt cert

# 4. Build and start
npm run docker:up

# 5. Verify
curl -k https://localhost/health
# → {"status":"ok","ts":1234567890}
```

The API is now running behind nginx at `https://localhost`.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `GOOGLE_CLIENT_ID` | ✅ | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | ✅ | Google OAuth 2.0 client secret |
| `ENCRYPTION_KEY` | ✅ (cloud) | 32-byte base64 key for AES-256-GCM token encryption |
| `JWT_SECRET` | ✅ (cloud) | ≥32-byte base64 secret for HS256 JWT signing |
| `ALLOWED_ORIGINS` | ✅ (cloud) | Comma-separated CORS origins, e.g. `https://app.example.com` |
| `DB_PATH` | — | Absolute path to the SQLite file (default: `/data/emails.db` in Docker, `data/emails.db` locally) |
| `PORT` | — | API listen port (default: `4000`) |
| `NODE_ENV` | — | `production` disables verbose error messages in responses |
| `ENCRYPTION_KEY_PREV` | — | Previous encryption key — set during key rotation (see [Key Rotation](#key-rotation)) |
| `HMAC_SECRET` | — | Override HMAC signing key (defaults to `ENCRYPTION_KEY`) |

Generate keys with the built-in scripts:

```bash
npm run gen-key          # ENCRYPTION_KEY — 32 random bytes, base64
npm run gen-jwt-secret   # JWT_SECRET — 48 random bytes, base64
```

---

## Security Architecture

### Encryption at Rest

OAuth tokens (access token, refresh token) are encrypted before being written to SQLite using **AES-256-GCM**.

**Wire format** stored in the DB column:
```
base64(iv) : base64(authTag) : base64(ciphertext)
```

- **IV** — 12 random bytes generated freshly per encryption call (prevents nonce reuse)
- **Auth tag** — 16 bytes; GCM's built-in integrity check — any byte modification causes decryption to throw
- **Key** — 32 bytes from `ENCRYPTION_KEY` env var; never stored in the DB

```js
// src/server/crypto.js
const { encrypt, decrypt, decryptWithFallback } = require('./src/server/crypto');

const ciphertext = encrypt('ya29.a0...token');
// → "dGf3K...:aB9Wq...:mNpRs..."

const plaintext = decrypt(ciphertext);
// → "ya29.a0...token"
```

If `ENCRYPTION_KEY` is not set (desktop/dev mode without `.env`), tokens are stored as plaintext with a `console.warn`. The app does **not** crash — it degrades gracefully. Set the key in production.

### JWT Authentication

The cloud API uses **stateless JWT** (HS256) with no external dependencies — built entirely on Node's `crypto.createHmac`.

| Token | TTL | Usage |
|---|---|---|
| Access token | 15 minutes | `Authorization: Bearer <token>` header on every API request |
| Refresh token | 7 days | `POST /auth/refresh` body to get a new access token |

**Tamper protection** — the signature comparison uses `crypto.timingSafeEqual` to prevent timing-oracle attacks.

**Auth flow:**

```
Client                           API                       Google
  │                               │                           │
  │  POST /auth/oauth/start        │                           │
  │──────────────────────────────►│                           │
  │  ← { redirectUrl }            │                           │
  │                               │                           │
  │  [user opens redirectUrl in browser]                      │
  │──────────────────────────────────────────────────────────►│
  │                               │◄─── OAuth callback ───────│
  │                               │  (tokens saved, encrypted)│
  │                               │                           │
  │  POST /auth/token             │                           │
  │──────────────────────────────►│                           │
  │  ← { accessToken, refreshToken, expiresIn }               │
  │                               │                           │
  │  GET /api/emails/search        │                           │
  │  Authorization: Bearer <at>   │                           │
  │──────────────────────────────►│                           │
  │  ← results                    │                           │
```

### Application Gateway (nginx)

nginx sits in front of the Node.js API and handles:

| Concern | Configuration |
|---|---|
| **TLS termination** | TLS 1.2 / 1.3 only; ECDHE cipher suite; OCSP stapling; session tickets disabled |
| **HTTP redirect** | All port-80 traffic is 301'd to HTTPS |
| **Rate limiting** | `api` zone: 120 req/min with burst 30. `auth` zone: 20 req/15 min with burst 5 |
| **HSTS** | `max-age=31536000; includeSubDomains` — forces HTTPS for 1 year after first visit |
| **CSP** | `default-src 'none'` with minimal allowlist — blocks XSS injection |
| **Clickjacking** | `X-Frame-Options: DENY` |
| **MIME sniffing** | `X-Content-Type-Options: nosniff` |
| **Server identity** | `server_tokens off` — hides nginx version from attackers |
| **Request size** | `client_max_body_size 512k` — prevents oversized payload attacks |
| **Isolation** | The API port (4000) is never exposed to the host; all traffic routes through nginx |

The Express app also runs its own in-process rate limiter as a secondary defence if nginx is bypassed (e.g., during local dev without Docker).

---

## API Reference

**Base URL:** `https://your-domain.com`

All `/api/*` endpoints require `Authorization: Bearer <accessToken>`.  
All responses are `application/json`.

### Authentication Endpoints

#### `GET /health`
No auth required. Returns server status.

```json
{ "status": "ok", "ts": 1718000000000 }
```

---

#### `GET /auth/status`
Check whether a Google OAuth session exists.

```json
{ "authenticated": true }
```

---

#### `POST /auth/oauth/start`
Initiates the Google OAuth 2.0 flow. Returns the consent-screen URL.

**Response**
```json
{
  "redirectUrl": "https://accounts.google.com/o/oauth2/auth?..."
}
```

Open `redirectUrl` in the user's browser. Poll `GET /auth/status` until `authenticated` is `true`.

---

#### `POST /auth/token`
Exchanges a completed Google OAuth session for JWT tokens. Call this after `GET /auth/status` returns `true`.

**Response**
```json
{
  "accessToken":  "eyJ...",
  "refreshToken": "eyJ...",
  "expiresIn":    900,
  "tokenType":    "Bearer"
}
```

---

#### `POST /auth/refresh`
Exchanges a refresh token for a new access token.

**Body**
```json
{ "refreshToken": "eyJ..." }
```

**Response** — same shape as `/auth/token`.

---

#### `POST /auth/logout` 🔒
Clears the stored Google OAuth tokens. The user must re-authenticate with Google.

**Response**
```json
{ "success": true }
```

---

### Email Endpoints

All require `Authorization: Bearer <accessToken>`.

#### `GET /api/emails/search`

Search and filter emails.

| Query param | Type | Default | Description |
|---|---|---|---|
| `q` | string | — | Full-text search across subject, sender, snippet, body |
| `sender` | string | — | Filter by sender (partial match) |
| `dateFrom` | string | — | ISO date, e.g. `2024-01-01` |
| `dateTo` | string | — | ISO date, e.g. `2024-12-31` |
| `hasAttachments` | boolean | — | `true` to show only emails with attachments |
| `label` | string | — | Gmail label, e.g. `INBOX`, `IMPORTANT` |
| `category` | string | — | ML category: `newsletter`, `work`, `personal`, `notification`, `other` |
| `limit` | number | `50` | Max results (capped at 200) |
| `offset` | number | `0` | Pagination offset |

**Response**
```json
{
  "results": [
    {
      "id": "18e4a...",
      "subject": "Your weekly report",
      "sender": "reports@example.com",
      "snippet": "Here is your summary...",
      "internal_date": 1718000000000,
      "labels": "[\"INBOX\"]",
      "has_attachments": 0,
      "category": "newsletter"
    }
  ],
  "count": 1,
  "offset": 0
}
```

---

#### `GET /api/emails/:id`
Fetch a single email with its body, attachments, and thread.

**Response**
```json
{
  "email": { "id": "18e4a...", "subject": "...", "sender": "...", "..." : "..." },
  "body":  { "email_id": "18e4a...", "body_text": "...", "body_html": "..." },
  "attachments": [{ "filename": "report.pdf", "mime_type": "application/pdf", "size": 204800 }],
  "thread": [ { "id": "...", "subject": "..." } ]
}
```

---

#### `POST /api/emails/sync`
Trigger a Gmail sync. Fetches up to 100 new emails in parallel batches of 10.

**Body**
```json
{ "incremental": true }
```

Set `incremental: false` to re-fetch from 90 days ago instead of the last known email date.

**Response**
```json
{ "count": 47, "success": true }
```

---

#### `POST /api/emails/:id/fetch-full`
Download the full body and attachments of a specific email from Gmail.

**Response**
```json
{
  "success": true,
  "body": "Hi team,\n\nHere is the...",
  "attachments": [{ "filename": "deck.pdf", "size": 1048576 }]
}
```

---

### Analytics Endpoints

All require `Authorization: Bearer <accessToken>`.  
Stats endpoints are cached in-process for 60 seconds.

---

#### `GET /api/analytics/stats`
Aggregated mailbox statistics.

**Response**
```json
{
  "total_emails": 4821,
  "unique_senders": 312,
  "emails_with_attachments": 408,
  "total_attachments": 892,
  "avg_email_size": 18432.7
}
```

---

#### `GET /api/analytics/volume?days=30`
Daily email volume for the last N days (max 365).

**Response**
```json
[
  { "date": "2024-06-13", "count": 38, "attachments": 4, "avg_size": 15000 },
  { "date": "2024-06-12", "count": 52, "attachments": 9, "avg_size": 22100 }
]
```

---

#### `GET /api/analytics/attachments`
Attachment breakdown by MIME type (cached 5 min).

**Response**
```json
[
  { "mime_type": "application/pdf",  "total_attachments": 142, "total_size": 298000000 },
  { "mime_type": "image/png",        "total_attachments":  98, "total_size":  44000000 }
]
```

---

#### `POST /api/analytics/analyze`
Run AI analysis. Omit `prompt` for a default summary; include one for intent-based queries.

**Body**
```json
{ "prompt": "who emails me most?" }
```

**Supported prompt intents**

| Intent | Example prompts |
|---|---|
| `top_sender` | "who emails me most", "top senders" |
| `newsletter` | "how many newsletters", "newsletter count" |
| `important` | "important emails", "starred" |
| `recent` | "latest emails", "most recent" |
| `pattern` | "busiest day", "weekly pattern" |
| `category` | "email categories", "breakdown" |
| `general` | anything else — returns help text |

**Response**
```json
{
  "prompt": "who emails me most?",
  "results": [
    "1. noreply@github.com - 214 emails",
    "2. team@linear.app - 87 emails",
    "3. alerts@aws.com - 63 emails"
  ]
}
```

---

#### `GET /api/analytics/insights?limit=20`
Retrieve stored proactive AI insights.

**Response**
```json
[
  {
    "id": 7,
    "type": "volume_anomaly",
    "title": "Email Volume Change",
    "content": "Your email volume increased by 83% compared to yesterday. Busy day!",
    "generated_at": "2024-06-13T09:00:00",
    "is_read": 0
  }
]
```

---

#### `POST /api/analytics/insights/generate`
Trigger on-demand proactive insight generation.

**Response**
```json
{ "generated": 2, "insights": [ { "type": "weekly_summary", "..." : "..." } ] }
```

---

#### `PATCH /api/analytics/insights/:id/read`
Mark an insight as read.

**Response**
```json
{ "success": true }
```

---

#### `GET /api/analytics/calendar?dateFrom=&dateTo=`
Fetch stored calendar events. `dateFrom` and `dateTo` are Unix timestamps (ms).

---

#### `POST /api/analytics/calendar/sync`
Sync the last 7 days and next 7 days of Google Calendar events.

**Response**
```json
{ "count": 14, "success": true }
```

---

#### `GET /api/analytics/calendar/correlation`
30-day correlation between calendar event count and email volume per day.

**Response**
```json
[
  { "date": "2024-06-13", "event_count": 4, "email_count": 62 },
  { "date": "2024-06-12", "event_count": 1, "email_count": 28 }
]
```

---

#### `GET /api/analytics/widgets`
Retrieve saved dashboard widget layout.

#### `PUT /api/analytics/widgets`
Save dashboard widget layout. Body must be an array of widget objects.

---

### Job Application Endpoints

All require `Authorization: Bearer <accessToken>`.

---

#### `GET /api/jobs`
List all tracked job applications, ordered by `date_applied DESC`.

**Response**
```json
[
  {
    "id": 3,
    "job_title": "Senior Backend Engineer",
    "company_name": "Acme Corp",
    "status": "interview",
    "location": "Remote",
    "date_applied": "2024-06-10",
    "notes": "Phone screen scheduled for June 15"
  }
]
```

---

#### `POST /api/jobs`
Add a new job application.

**Body**
```json
{
  "job_title":    "Senior Backend Engineer",
  "company_name": "Acme Corp",
  "status":       "applied",
  "date_applied": "2024-06-13",
  "location":     "Remote",
  "job_id":       "JR-4821",
  "notes":        "Referred by Jane"
}
```

`status` must be one of: `applied`, `interview`, `rejected`, `accepted`.

**Response** `201`
```json
{ "id": 4 }
```

---

#### `PUT /api/jobs/:id`
Update an existing job application. Body is the same shape as `POST /api/jobs`.

**Response**
```json
{ "success": true }
```

---

#### `DELETE /api/jobs/:id`

**Response**
```json
{ "success": true }
```

---

#### `GET /api/jobs/analyze`
AI analysis of your job application pipeline.

**Response**
```json
{
  "summary": "12 job applications tracked. 3 active interviews.",
  "insights": [
    "You've submitted 12 job applications total.",
    "6 pending, 3 in interview, 2 rejected, 1 accepted.",
    "Interview rate: 25.0%",
    "You have 3 active interviews — keep preparing!"
  ],
  "stats": { "applied": 6, "interview": 3, "rejected": 2, "accepted": 1 }
}
```

---

#### `POST /api/jobs/scan-emails`
Run the ML job classifier over your 200 most recent emails and return matches.

**Response**
```json
[
  {
    "emailId":    "18e4a...",
    "subject":    "Your application to Stripe",
    "sender":     "jobs@stripe.com",
    "category":   "application_received",
    "confidence": 94,
    "date":       1718000000000
  }
]
```

---

## Database Schema

```sql
emails (
  id TEXT PRIMARY KEY,        -- Gmail message ID
  thread_id TEXT,
  sender TEXT,
  recipients TEXT,
  subject TEXT,
  snippet TEXT,
  body TEXT,
  internal_date INTEGER,      -- Unix ms timestamp
  labels TEXT,                -- JSON array of Gmail label IDs
  has_attachments INTEGER,
  attachment_count INTEGER,
  email_size INTEGER,
  account_id TEXT,
  category TEXT               -- ML-assigned category (persisted)
)

oauth_tokens (
  id INTEGER PRIMARY KEY CHECK (id = 1),  -- single-row table
  access_token TEXT,    -- AES-256-GCM encrypted
  refresh_token TEXT,   -- AES-256-GCM encrypted
  expiry_date INTEGER   -- plaintext Unix ms (used for TTL checks)
)

job_applications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  job_title TEXT, job_id TEXT, company_name TEXT,
  status TEXT CHECK(status IN ('applied','interview','rejected','accepted')),
  location TEXT, date_applied TEXT, notes TEXT, created_at TEXT
)

ai_insights (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT, title TEXT, content TEXT,
  data_snapshot TEXT, generated_at TEXT, is_read INTEGER
)

calendar_events (
  id TEXT PRIMARY KEY,
  account_id TEXT, summary TEXT, description TEXT,
  start_time INTEGER, end_time INTEGER,
  event_type TEXT, email_count INTEGER
)

dashboard_widgets (
  id TEXT PRIMARY KEY,
  type TEXT, chart_type TEXT, title TEXT, data_source TEXT,
  width INTEGER, height INTEGER, position_x INTEGER, position_y INTEGER,
  config TEXT  -- JSON blob
)
```

Indexes: `idx_emails_date`, `idx_emails_sender`, `idx_emails_subject`, `idx_emails_account`.

---

## ML Classification

Three classifiers are trained at first use (lazy-loaded; no startup delay):

| Classifier | Training file | Output |
|---|---|---|
| Email category | `src/ml/training-data/email-categories.json` | `newsletter`, `work`, `personal`, `notification`, `other` |
| Intent | `src/ml/training-data/intents.json` | `top_sender`, `newsletter`, `important`, `recent`, `pattern`, `category`, `general` |
| Job email | `src/ml/training-data/job-emails.json` | `application_received`, `interview_invite`, `rejection`, `offer`, `other` |

Each training file is a JSON object mapping label → array of example strings:

```json
{
  "newsletter": [
    "weekly digest unsubscribe",
    "your monthly newsletter"
  ],
  "work": [
    "meeting agenda action items",
    "pull request review"
  ]
}
```

Re-train at runtime: `POST /api/jobs/scan-emails` (triggers `reloadAllClassifiers` internally after any training data save via the desktop app's UI).

---

## Key Rotation

To rotate the encryption key without locking users out:

```bash
# 1. Generate a new key
npm run gen-key
# → ENCRYPTION_KEY=newKeyBase64Here

# 2. In .env.production:
#    Move the current ENCRYPTION_KEY value to ENCRYPTION_KEY_PREV
#    Set ENCRYPTION_KEY to the new value
ENCRYPTION_KEY=newKeyBase64Here
ENCRYPTION_KEY_PREV=oldKeyBase64Here

# 3. Restart the app — existing rows decrypt via the fallback key,
#    new writes use the new key. No user action required.

# 4. After all users have re-authenticated (old tokens replaced),
#    remove ENCRYPTION_KEY_PREV from your secrets manager.
```

---

## Deploying to Cloud

### AWS / GCP / DigitalOcean (Docker)

```bash
# On your server:
git clone https://github.com/kennyrobert88/analy.git
cd analy

# Fill in secrets
cp .env.production.example .env.production
vim .env.production

# Install a real TLS cert (Let's Encrypt)
# Un-comment the certbot service in deploy/docker-compose.yml, then:
# docker compose -f deploy/docker-compose.yml run --rm certbot \
#   certonly --webroot -w /var/www/certbot -d yourdomain.com

# Or for quick staging: self-signed cert
sh deploy/gen-dev-certs.sh

# Start
npm run docker:up

# Tail logs
docker compose -f deploy/docker-compose.yml logs -f
```

### Health checks for load balancers

```
GET /health  → 200 { "status": "ok" }
GET /ready   → 200 { "status": "ready" }
```

Both endpoints require no authentication and return in < 5 ms.

### Scaling notes

- The API is stateless (JWT); multiple instances can run behind a load balancer
- SQLite is single-writer by design — for multi-instance deployments, mount the `/data` volume on shared NFS **or** migrate to PostgreSQL (swap `sqlite3` for `pg` in `src/db/index.js`)
- The in-process rate limiter is per-instance; for multi-instance use Redis-backed rate limiting (e.g. `rate-limiter-flexible`)

---

## Development

```bash
# Install dependencies
npm install

# Run the Electron desktop app
npm start

# Run the cloud API server locally (no Docker)
cp .env.production.example .env.production
# fill in at minimum: ENCRYPTION_KEY, JWT_SECRET, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
npm run server:dev

# Run tests
npm test           # ML classifier tests
npm run test:ai    # AI analysis tests

# Docker helpers
npm run docker:build   # build image
npm run docker:up      # start stack (detached)
npm run docker:down    # stop stack
```

### Generating secrets locally

```bash
npm run gen-key          # prints a ready-to-paste ENCRYPTION_KEY line
npm run gen-jwt-secret   # prints a ready-to-paste JWT_SECRET line
```
