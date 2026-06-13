const express = require('express');
const router = express.Router();
const { startOAuthFlow, isAuthenticated, logout, handleCallback } = require('../../auth');
const { issueTokens, refreshAccessToken, verifyToken, verify } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

// GET /auth/status
router.get('/status', async (req, res, next) => {
  try {
    const authenticated = await isAuthenticated();
    res.json({ authenticated });
  } catch (err) { next(err); }
});

/**
 * POST /auth/oauth/start
 * Returns the Google consent URL — the client opens it in a browser tab.
 * The OAuth callback server then exchanges the code and stores tokens.
 * Poll GET /auth/status to detect completion.
 */
router.post('/oauth/start', async (req, res, next) => {
  try {
    let redirectUrl = null;

    // startOAuthFlow expects a function that "opens" the URL;
    // in server mode we capture it and return it to the caller.
    const flowPromise = startOAuthFlow((url) => {
      redirectUrl = url;
      // Return without resolving so the server keeps listening for the callback.
      return Promise.resolve();
    });

    // Give the callback server ~500 ms to boot and set redirectUrl
    await new Promise(r => setTimeout(r, 500));

    if (!redirectUrl) {
      return res.status(500).json({ error: 'Failed to generate OAuth URL' });
    }

    res.json({ redirectUrl });

    // Let the flow resolve/reject in the background; errors are logged.
    flowPromise.catch(err => console.error('OAuth flow error:', err.message));
  } catch (err) { next(err); }
});

/**
 * POST /auth/token
 * Called after the user completes the Google consent screen.
 * Issues a JWT access + refresh token pair.
 */
router.post('/token', async (req, res, next) => {
  try {
    const authenticated = await isAuthenticated();
    if (!authenticated) {
      return res.status(401).json({ error: 'Google OAuth not completed yet' });
    }
    res.json(issueTokens('primary'));
  } catch (err) { next(err); }
});

/**
 * POST /auth/refresh
 * Body: { refreshToken: string }
 */
router.post('/refresh',
  validate({ body: { refreshToken: 'string' } }),
  (req, res, next) => {
    try {
      const tokens = refreshAccessToken(req.body.refreshToken);
      res.json(tokens);
    } catch (err) {
      res.status(401).json({ error: err.message });
    }
  }
);

/**
 * POST /auth/logout  (requires valid access token)
 */
router.post('/logout', verifyToken, async (req, res, next) => {
  try {
    await logout();
    res.json({ success: true });
  } catch (err) { next(err); }
});

module.exports = router;
