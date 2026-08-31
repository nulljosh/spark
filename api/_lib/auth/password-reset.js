const crypto = require('crypto');
const { sendMail, baseUrl, hasTransport } = require('../mail');
const { findUserByUsername, findUserByEmail, setResetToken, findUserByResetToken, updatePassword, clearResetToken } = require('../store');
const { getIp, checkRateLimit } = require('../ratelimit');

const GENERIC_MESSAGE = 'If an account exists with that info, a reset link has been sent.';
const MAIL_DOWN = 'Password reset is unavailable right now. Please contact support.';

async function sendResetEmail(email, token) {
  const resetLink = `${baseUrl()}/reset-password?token=${token}`;
  return sendMail({
    to: email,
    subject: 'Spark — Password Reset',
    text: `You requested a password reset.\n\nClick here to reset your password:\n${resetLink}\n\nThis link expires in 1 hour.\n\nIf you didn't request this, ignore this email.`,
    html: `<p>You requested a password reset.</p><p><a href="${resetLink}">Click here to reset your password</a></p><p>This link expires in 1 hour.</p><p>If you didn't request this, ignore this email.</p>`,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query || {};

  // POST /api/auth/password-reset?action=forgot
  if (action === 'forgot') {
    if (!checkRateLimit('reset-forgot:' + getIp(req), 5, 60_000)) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    const { username, email } = req.body || {};
    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    // The generic message below deliberately hides whether an account exists.
    // With no transport at all it would hide something else: that no mail is
    // ever sent, to anyone. Say so instead of promising a link that cannot come.
    if (!hasTransport()) return res.status(503).json({ error: MAIL_DOWN });
    try {
      let user = null;
      if (username) user = await findUserByUsername(username);
      if (!user && email) user = await findUserByEmail(email);
      if (user && user.email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await setResetToken(user.username, token, expires);
        const sent = await sendResetEmail(user.email, token);
        // A dead transport is not account-specific, so saying so leaks nothing
        // the generic message is protecting. A configured-but-broken key looks
        // identical to a working one until a send is attempted -- which is how
        // this went unnoticed for months while every reset silently vanished.
        if (!sent) return res.status(503).json({ error: MAIL_DOWN });
      }
    } catch (err) {
      console.error('[password-reset] Error:', err.message);
      return res.status(503).json({ error: MAIL_DOWN });
    }
    return res.status(200).json({ message: GENERIC_MESSAGE });
  }

  // POST /api/auth/password-reset?action=reset
  if (action === 'reset') {
    if (!checkRateLimit('reset-confirm:' + getIp(req), 10, 60_000)) {
      return res.status(429).json({ error: 'Too many requests. Try again later.' });
    }
    const { token, password } = req.body || {};
    if (!token || !password) {
      return res.status(400).json({ error: 'Token and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }
    try {
      const user = await findUserByResetToken(token);
      if (!user) {
        return res.status(400).json({ error: 'Invalid or expired reset token' });
      }
      await updatePassword(user.username, password);
      await clearResetToken(user.username);
      return res.status(200).json({ message: 'Password has been reset successfully' });
    } catch {
      return res.status(500).json({ error: 'Failed to reset password' });
    }
  }

  return res.status(400).json({ error: 'Unknown action. Use ?action=forgot or ?action=reset' });
};
