const crypto = require('crypto');
const { findUserByUsername, findUserByEmail, setResetToken, findUserByResetToken, updatePassword, clearResetToken } = require('./store');

const GENERIC_MESSAGE = 'If an account exists with that info, a reset link has been sent.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { action } = req.query || {};

  // POST /api/auth/password-reset?action=forgot
  if (action === 'forgot') {
    const { username, email } = req.body || {};
    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    try {
      let user = null;
      if (username) user = await findUserByUsername(username);
      if (!user && email) user = await findUserByEmail(email);
      if (user) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await setResetToken(user.username, token, expires);
        // TODO: Send email with reset link
      }
    } catch {
      // Swallow errors
    }
    return res.status(200).json({ message: GENERIC_MESSAGE });
  }

  // POST /api/auth/password-reset?action=reset
  if (action === 'reset') {
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
