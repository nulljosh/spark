const { findUserByVerifyToken, markVerified } = require('../store');

// GET /api/auth?action=verify-email&token=... — clicked from the sign-up email.
// Always redirects (this is opened in a browser, not by a client), and reveals
// nothing about which tokens exist beyond success/failure.
module.exports = async function handler(req, res) {
  const base = process.env.APP_URL || 'https://sparkjar.heyitsmejosh.com';
  const token = (req.query || {}).token;

  let ok = false;
  try {
    const user = token && (await findUserByVerifyToken(token));
    if (user) {
      await markVerified(user.username);
      ok = true;
    }
  } catch (err) {
    console.error('[verify-email] Error:', err && err.message);
  }

  res.writeHead(302, { Location: `${base}/?verified=${ok ? 1 : 0}` });
  return res.end();
};
