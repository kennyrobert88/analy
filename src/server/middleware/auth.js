/**
 * Stateless JWT authentication middleware — HMAC-SHA256 (HS256).
 *
 * No external dependencies; built on Node's crypto module.
 *
 * Token lifetimes:
 *   Access token  — 15 minutes  (sent as Bearer in Authorization header)
 *   Refresh token — 7 days      (POST /auth/refresh)
 *
 * Environment variables required:
 *   JWT_SECRET   — at least 32 random bytes, base64-encoded
 */

const crypto = require('crypto');

const ACCESS_TTL  = 15 * 60;           // 15 min in seconds
const REFRESH_TTL = 7 * 24 * 60 * 60;  // 7 days

function requireSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET environment variable is required');
  return Buffer.from(s, 'base64');
}

// ── Encoding helpers ────────────────────────────────────────────────────────

function b64url(buf) {
  return buf.toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  const padded = str.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padding), 'base64');
}

// ── Sign / verify ───────────────────────────────────────────────────────────

const HEADER = b64url(Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));

function sign(payload, ttlSeconds) {
  const secret = requireSecret();
  const now = Math.floor(Date.now() / 1000);
  const body = b64url(Buffer.from(JSON.stringify({
    ...payload,
    iat: now,
    exp: now + ttlSeconds,
  })));
  const sig = b64url(crypto.createHmac('sha256', secret).update(`${HEADER}.${body}`).digest());
  return `${HEADER}.${body}.${sig}`;
}

function verify(token) {
  const secret = requireSecret();
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed token');

  const [header, body, sig] = parts;
  const expectedSig = b64url(
    crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest()
  );

  // Constant-time comparison prevents timing attacks
  const sigBuf = Buffer.from(sig.padEnd(expectedSig.length, ' '));
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length ||
      !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('Invalid token signature');
  }

  const payload = JSON.parse(b64urlDecode(body).toString());
  if (payload.exp < Math.floor(Date.now() / 1000)) {
    throw new Error('Token has expired');
  }
  return payload;
}

// ── Public helpers ──────────────────────────────────────────────────────────

function issueTokens(userId) {
  return {
    accessToken:  sign({ sub: userId, type: 'access'  }, ACCESS_TTL),
    refreshToken: sign({ sub: userId, type: 'refresh' }, REFRESH_TTL),
    expiresIn: ACCESS_TTL,
    tokenType: 'Bearer',
  };
}

function refreshAccessToken(refreshToken) {
  const payload = verify(refreshToken);
  if (payload.type !== 'refresh') throw new Error('Not a refresh token');
  return issueTokens(payload.sub);
}

// ── Express middleware ──────────────────────────────────────────────────────

function verifyToken(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Authorization: Bearer <token> header' });
  }
  try {
    const payload = verify(header.slice(7));
    if (payload.type !== 'access') return res.status(401).json({ error: 'Not an access token' });
    req.user = payload;
    next();
  } catch (err) {
    return res.status(401).json({ error: err.message });
  }
}

module.exports = { issueTokens, refreshAccessToken, verifyToken, verify };
