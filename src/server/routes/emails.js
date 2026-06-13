const express = require('express');
const router = express.Router();
const { fetchEmails, fetchEmailById } = require('../../auth');
const {
  searchEmails, getEmailById, getEmailsByThread,
  getEmailBody, getEmailAttachments,
} = require('../../db');
const { validate, sanitizeSearchQuery } = require('../middleware/validate');

// GET /api/emails/search?q=&sender=&dateFrom=&dateTo=&hasAttachments=&label=&category=&limit=&offset=
router.get('/search', async (req, res, next) => {
  try {
    const q = sanitizeSearchQuery(req.query.q);
    const filters = {
      sender:         req.query.sender || undefined,
      dateFrom:       req.query.dateFrom || undefined,
      dateTo:         req.query.dateTo || undefined,
      hasAttachments: req.query.hasAttachments === 'true',
      label:          req.query.label || undefined,
      category:       req.query.category || undefined,
      accountId:      req.query.accountId || undefined,
      limit:          Math.min(parseInt(req.query.limit) || 50, 200),
      offset:         parseInt(req.query.offset) || 0,
    };
    const results = await searchEmails(q, filters);
    res.json({ results, count: results.length, offset: filters.offset });
  } catch (err) { next(err); }
});

// GET /api/emails/:id
router.get('/:id', async (req, res, next) => {
  try {
    const email = await getEmailById(req.params.id);
    if (!email) return res.status(404).json({ error: 'Email not found' });
    const body = await getEmailBody(req.params.id);
    const attachments = await getEmailAttachments(req.params.id);
    const thread = await getEmailsByThread(email.thread_id);
    res.json({ email, body, attachments, thread });
  } catch (err) { next(err); }
});

// POST /api/emails/sync   { incremental: boolean }
router.post('/sync',
  validate({ body: { incremental: 'boolean?' } }),
  async (req, res, next) => {
    try {
      const incremental = req.body.incremental !== false;
      const result = await fetchEmails(100, incremental);
      res.json(result);
    } catch (err) { next(err); }
  }
);

// POST /api/emails/:id/fetch-full
router.post('/:id/fetch-full', async (req, res, next) => {
  try {
    const result = await fetchEmailById(req.params.id);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
