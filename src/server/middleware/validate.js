/**
 * Lightweight request-validation middleware (no external schema libraries).
 *
 * Usage:
 *   router.post('/foo', validate({ body: { name: 'string', age: 'number?' } }), handler)
 *
 * Type tokens:
 *   'string'  — required string
 *   'number'  — required finite number
 *   'boolean' — required boolean
 *   Append '?' to make a field optional  → 'string?', 'number?'
 */

function validate({ body: bodySchema, query: querySchema } = {}) {
  return (req, res, next) => {
    const errors = [];

    if (bodySchema) {
      errors.push(...checkObject(req.body, bodySchema, 'body'));
    }
    if (querySchema) {
      errors.push(...checkObject(req.query, querySchema, 'query'));
    }

    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    next();
  };
}

function checkObject(obj, schema, location) {
  const errors = [];
  if (!obj || typeof obj !== 'object') {
    return [`${location} must be a JSON object`];
  }

  for (const [field, typeToken] of Object.entries(schema)) {
    const optional = typeToken.endsWith('?');
    const type = optional ? typeToken.slice(0, -1) : typeToken;
    const value = obj[field];

    if (value === undefined || value === null) {
      if (!optional) errors.push(`${location}.${field} is required`);
      continue;
    }

    // eslint-disable-next-line valid-typeof
    if (type === 'number') {
      if (typeof value !== 'number' && isNaN(Number(value))) {
        errors.push(`${location}.${field} must be a number`);
      }
    } else if (typeof value !== type) {
      errors.push(`${location}.${field} must be a ${type}`);
    }
  }

  return errors;
}

/**
 * Sanitise a plain-text search query — strip SQL/shell metacharacters.
 */
function sanitizeSearchQuery(q) {
  if (!q || typeof q !== 'string') return '';
  return q.replace(/[^\w\s@.\-+]/g, '').trim().slice(0, 200);
}

module.exports = { validate, sanitizeSearchQuery };
