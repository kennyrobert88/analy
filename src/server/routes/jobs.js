const express = require('express');
const router = express.Router();
const {
  getJobApplications, addJobApplication,
  updateJobApplication, deleteJobApplication,
} = require('../../db');
const { analyzeJobApplications, classifyJobEmails } = require('../../ai');
const { searchEmails } = require('../../db');
const { validate } = require('../middleware/validate');

const JOB_SCHEMA = {
  job_title:    'string',
  company_name: 'string',
  status:       'string',
  date_applied: 'string',
  job_id:       'string?',
  location:     'string?',
  notes:        'string?',
};

const VALID_STATUSES = new Set(['applied', 'interview', 'rejected', 'accepted']);

function validateStatus(status, res) {
  if (!VALID_STATUSES.has(status)) {
    res.status(400).json({ error: `status must be one of: ${[...VALID_STATUSES].join(', ')}` });
    return false;
  }
  return true;
}

// GET /api/jobs
router.get('/', async (req, res, next) => {
  try {
    res.json(await getJobApplications());
  } catch (err) { next(err); }
});

// POST /api/jobs
router.post('/', validate({ body: JOB_SCHEMA }), async (req, res, next) => {
  try {
    if (!validateStatus(req.body.status, res)) return;
    const result = await addJobApplication(req.body);
    res.status(201).json(result);
  } catch (err) { next(err); }
});

// PUT /api/jobs/:id
router.put('/:id', validate({ body: JOB_SCHEMA }), async (req, res, next) => {
  try {
    if (!validateStatus(req.body.status, res)) return;
    const updated = await updateJobApplication(parseInt(req.params.id), req.body);
    if (!updated) return res.status(404).json({ error: 'Job application not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// DELETE /api/jobs/:id
router.delete('/:id', async (req, res, next) => {
  try {
    const deleted = await deleteJobApplication(parseInt(req.params.id));
    if (!deleted) return res.status(404).json({ error: 'Job application not found' });
    res.json({ success: true });
  } catch (err) { next(err); }
});

// GET /api/jobs/analyze
router.get('/analyze', async (req, res, next) => {
  try {
    const apps = await getJobApplications();
    res.json(analyzeJobApplications(apps));
  } catch (err) { next(err); }
});

// POST /api/jobs/scan-emails   — classify recent inbox emails as job-related
router.post('/scan-emails', async (req, res, next) => {
  try {
    const emails = await searchEmails('', { limit: 200, offset: 0 });
    res.json(classifyJobEmails(emails));
  } catch (err) { next(err); }
});

module.exports = router;
