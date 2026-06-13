/**
 * Analy — Express API server
 *
 * Replaces Electron IPC for cloud deployments.
 * Every route that was previously an ipcMain.handle() now lives here.
 *
 * Security layers (innermost → outermost):
 *   1. This file  — rate-limiting, CORS, body-size limits, input validation
 *   2. nginx      — TLS termination, IP-level rate-limiting, security headers
 *
 * Start:
 *   node src/server/index.js
 */

require('dotenv').config();

const express     = require('express');
const path        = require('path');

// ── Validate required env vars before anything else ─────────────────────────
const REQUIRED_ENV = ['ENCRYPTION_KEY', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'];
const missing = REQUIRED_ENV.filter(k => !process.env[k]);
if (missing.length > 0) {
  console.error(`[startup] Missing required environment variables: ${missing.join(', ')}`);
  console.error('[startup] See .env.production.example for guidance.');
  process.exit(1);
}

// ── Modules ─────────────────────────────────────────────────────────────────
const { initDb, closeDb } = require('../db');
const { initOAuth }       = require('../auth');
const { initClassifiers } = require('../ml');

const { verifyToken }   = require('./middleware/auth');
const authRoutes        = require('./routes/auth');
const emailRoutes       = require('./routes/emails');
const analyticsRoutes   = require('./routes/analytics');
const jobRoutes         = require('./routes/jobs');

// ── In-process rate limiter (backup to nginx) ────────────────────────────────
// Uses a sliding-window Map; no redis required for single-instance deployments.
function makeRateLimiter({ windowMs, max, message }) {
  const hits = new Map();

  return (req, res, next) => {
    const key = req.headers['x-forwarded-for']?.split(',')[0].trim() || req.socket.remoteAddress;
    const now = Date.now();
    const windowStart = now - windowMs;

    const timestamps = (hits.get(key) || []).filter(t => t > windowStart);
    timestamps.push(now);
    hits.set(key, timestamps);

    // Prevent unbounded growth
    if (hits.size > 10_000) {
      for (const [k, ts] of hits) {
        if (ts[ts.length - 1] < windowStart) hits.delete(k);
      }
    }

    res.setHeader('X-RateLimit-Limit',     max);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, max - timestamps.length));
    res.setHeader('X-RateLimit-Reset',     Math.ceil((windowStart + windowMs) / 1000));

    if (timestamps.length > max) {
      return res.status(429).json({ error: message });
    }
    next();
  };
}

const globalLimiter = makeRateLimiter({
  windowMs: 60_000,
  max: 120,
  message: 'Rate limit exceeded — please wait before retrying',
});

const authLimiter = makeRateLimiter({
  windowMs: 15 * 60_000,
  max: 20,
  message: 'Too many authentication attempts — wait 15 minutes',
});

// ── App ──────────────────────────────────────────────────────────────────────
const app = express();

// Trust X-Forwarded-For from nginx (one hop)
app.set('trust proxy', 1);

// ── Security headers (complement nginx's headers) ───────────────────────────
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options',        'DENY');
  res.setHeader('X-XSS-Protection',       '1; mode=block');
  res.removeHeader('X-Powered-By');
  next();
});

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (ALLOWED_ORIGINS.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin',      origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Methods',     'GET,POST,PUT,PATCH,DELETE,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers',     'Authorization,Content-Type');
    res.setHeader('Vary', 'Origin');
  }
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ── Body parsing ─────────────────────────────────────────────────────────────
app.use(express.json({ limit: '512kb' }));

// ── Global rate limit ────────────────────────────────────────────────────────
app.use(globalLimiter);

// ── Health / readiness endpoints (no auth) ───────────────────────────────────
app.get('/health', (_req, res) => res.json({ status: 'ok', ts: Date.now() }));
app.get('/ready',  (_req, res) => {
  // A more thorough check would ping the DB
  res.json({ status: 'ready' });
});

// ── Auth routes (stricter rate limit, no JWT required) ───────────────────────
app.use('/auth', authLimiter, authRoutes);

// ── Protected API routes ─────────────────────────────────────────────────────
app.use('/api/emails',    verifyToken, emailRoutes);
app.use('/api/analytics', verifyToken, analyticsRoutes);
app.use('/api/jobs',      verifyToken, jobRoutes);

// ── 404 catch-all ────────────────────────────────────────────────────────────
app.use((_req, res) => res.status(404).json({ error: 'Not found' }));

// ── Global error handler ─────────────────────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error('[error]', err.stack);
  res.status(status).json({
    error: status >= 500 && process.env.NODE_ENV === 'production'
      ? 'Internal server error'
      : err.message,
  });
});

// ── Bootstrap ────────────────────────────────────────────────────────────────
const PORT = parseInt(process.env.PORT) || 4000;

async function start() {
  try {
    await initDb();
    console.log('[db] Initialised');

    initOAuth();
    console.log('[auth] OAuth client ready');

    // Warm classifiers after the event loop is free (non-blocking)
    setImmediate(() => {
      initClassifiers();
      console.log('[ml] Classifiers loaded');
    });

    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`[server] Analy API listening on :${PORT} (${process.env.NODE_ENV || 'development'})`);
    });

    // Graceful shutdown
    const shutdown = async (signal) => {
      console.log(`[server] ${signal} received — shutting down…`);
      server.close(() => {
        closeDb();
        console.log('[server] Closed');
        process.exit(0);
      });
      setTimeout(() => process.exit(1), 10_000);
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT',  () => shutdown('SIGINT'));
  } catch (err) {
    console.error('[startup] Fatal error:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app; // for testing
