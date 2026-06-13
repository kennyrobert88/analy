const express = require('express');
const router = express.Router();
const {
  getDashStats, getDailyEmailVolume,
  getAiInsights, markInsightRead,
  getCalendarEvents, getCalendarEmailCorrelation,
  saveDashboardWidgets, getDashboardWidgets,
  getAttachmentStats,
} = require('../../db');
const { fetchCalendarEvents } = require('../../auth');
const { analyzeEmails, generateProactiveInsights } = require('../../ai');
const { validate } = require('../middleware/validate');

// Simple in-memory cache with TTL to avoid hammering the DB on every load
const cache = new Map();
function cached(key, ttlMs, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < ttlMs) return Promise.resolve(hit.data);
  return fn().then(data => { cache.set(key, { data, ts: Date.now() }); return data; });
}

// GET /api/analytics/stats
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await cached('dash_stats', 60_000, getDashStats);
    res.json(stats);
  } catch (err) { next(err); }
});

// GET /api/analytics/volume?days=30
router.get('/volume', async (req, res, next) => {
  try {
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const data = await cached(`volume_${days}`, 60_000, () => getDailyEmailVolume(days));
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/analytics/attachments
router.get('/attachments', async (req, res, next) => {
  try {
    const data = await cached('attachments', 300_000, getAttachmentStats);
    res.json(data);
  } catch (err) { next(err); }
});

// POST /api/analytics/analyze   { prompt?: string }
router.post('/analyze', async (req, res, next) => {
  try {
    const result = await analyzeEmails(req.body?.prompt || null, null);
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/analytics/insights?limit=20
router.get('/insights', async (req, res, next) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const insights = await getAiInsights(limit);
    res.json(insights);
  } catch (err) { next(err); }
});

// POST /api/analytics/insights/generate
router.post('/insights/generate', async (req, res, next) => {
  try {
    const insights = await generateProactiveInsights();
    res.json({ generated: insights.length, insights });
  } catch (err) { next(err); }
});

// PATCH /api/analytics/insights/:id/read
router.patch('/insights/:id/read', async (req, res, next) => {
  try {
    await markInsightRead(parseInt(req.params.id));
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/analytics/calendar?dateFrom=&dateTo=
router.get('/calendar', async (req, res, next) => {
  try {
    const dateFrom = parseInt(req.query.dateFrom) || Date.now() - 7 * 86400000;
    const dateTo   = parseInt(req.query.dateTo)   || Date.now() + 7 * 86400000;
    const events = await getCalendarEvents(dateFrom, dateTo);
    res.json(events);
  } catch (err) { next(err); }
});

// POST /api/analytics/calendar/sync
router.post('/calendar/sync', async (req, res, next) => {
  try {
    const result = await fetchCalendarEvents();
    res.json(result);
  } catch (err) { next(err); }
});

// GET /api/analytics/calendar/correlation
router.get('/calendar/correlation', async (req, res, next) => {
  try {
    const data = await getCalendarEmailCorrelation();
    res.json(data);
  } catch (err) { next(err); }
});

// GET /api/analytics/widgets
router.get('/widgets', async (req, res, next) => {
  try {
    res.json(await getDashboardWidgets());
  } catch (err) { next(err); }
});

// PUT /api/analytics/widgets
router.put('/widgets',
  validate({ body: {} }),   // body is an array — array check done below
  async (req, res, next) => {
    try {
      if (!Array.isArray(req.body)) {
        return res.status(400).json({ error: 'Body must be an array of widgets' });
      }
      await saveDashboardWidgets(req.body);
      res.json({ success: true });
    } catch (err) { next(err); }
  }
);

module.exports = router;
