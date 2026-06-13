/**
 * Symmetric encryption utilities — AES-256-GCM
 *
 * Stored wire format (colon-delimited, each segment base64):
 *   <iv>:<authTag>:<ciphertext>
 *
 * The auth-tag ensures tamper detection; any modification to the
 * ciphertext, IV, or tag causes decryption to throw.
 *
 * Key rotation: set ENCRYPTION_KEY_PREV to the old key while ENCRYPTION_KEY
 * holds the new one.  getToken() tries the current key first, then falls
 * back to ENCRYPTION_KEY_PREV so existing rows are transparently migrated
 * on next write.
 */

const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;   // 96-bit IV — recommended for GCM
const TAG_BYTES = 16;  // 128-bit auth tag
const KEY_BYTES = 32;  // 256-bit key

// ── Key helpers ────────────────────────────────────────────────────────────

function loadKey(envVar) {
  const raw = process.env[envVar];
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `${envVar} must be exactly ${KEY_BYTES} bytes when decoded ` +
      `(got ${key.length}).  Generate one with: node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`
    );
  }
  return key;
}

function requireKey() {
  const key = loadKey('ENCRYPTION_KEY');
  if (!key) throw new Error('ENCRYPTION_KEY environment variable is required for token encryption');
  return key;
}

// ── Core encrypt / decrypt ─────────────────────────────────────────────────

/**
 * Encrypt a string value. Returns a compact wire-format string or null if
 * the input is null/undefined.
 */
function encrypt(plaintext) {
  if (plaintext == null) return null;
  const key = requireKey();
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv, { authTagLength: TAG_BYTES });
  const encrypted = Buffer.concat([
    cipher.update(String(plaintext), 'utf8'),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, encrypted].map(b => b.toString('base64')).join(':');
}

/**
 * Decrypt a wire-format string.  Throws on tampered data.
 * Returns null if ciphertext is null.
 *
 * Pass an explicit key buffer to attempt decryption with a specific key
 * (used for key rotation).
 */
function decrypt(ciphertext, key = null) {
  if (ciphertext == null) return null;
  const resolvedKey = key || requireKey();
  const parts = ciphertext.split(':');
  if (parts.length !== 3) {
    throw new Error('Ciphertext is not in the expected iv:authTag:data format');
  }
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, 'base64');
  const authTag = Buffer.from(tagB64, 'base64');
  const data = Buffer.from(dataB64, 'base64');
  const decipher = crypto.createDecipheriv(ALGORITHM, resolvedKey, iv, { authTagLength: TAG_BYTES });
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

/**
 * Decrypt with automatic fallback to the previous key (key rotation support).
 * If both keys fail the error from the primary key is re-thrown.
 */
function decryptWithFallback(ciphertext) {
  if (ciphertext == null) return null;
  try {
    return decrypt(ciphertext);
  } catch (primaryErr) {
    const prevKey = loadKey('ENCRYPTION_KEY_PREV');
    if (!prevKey) throw primaryErr;
    try {
      return decrypt(ciphertext, prevKey);
    } catch {
      throw primaryErr; // surface the primary key error
    }
  }
}

// ── HMAC integrity check (for non-encrypted fields you still want to sign) ─

function hmacSign(value, secret = process.env.HMAC_SECRET || process.env.ENCRYPTION_KEY) {
  if (!secret) throw new Error('HMAC_SECRET or ENCRYPTION_KEY is required for signing');
  const key = Buffer.isBuffer(secret) ? secret : Buffer.from(secret, 'base64');
  return crypto.createHmac('sha256', key).update(String(value)).digest('hex');
}

function hmacVerify(value, signature, secret) {
  const expected = hmacSign(value, secret);
  const expectedBuf = Buffer.from(expected, 'hex');
  const actualBuf = Buffer.from(signature, 'hex');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

// ── Utility ────────────────────────────────────────────────────────────────

/**
 * Print a new random ENCRYPTION_KEY to stdout — run once during deployment.
 *   node -e "require('./src/server/crypto').printNewKey()"
 */
function printNewKey() {
  console.log(crypto.randomBytes(KEY_BYTES).toString('base64'));
}

module.exports = {
  encrypt,
  decrypt,
  decryptWithFallback,
  hmacSign,
  hmacVerify,
  printNewKey,
};
