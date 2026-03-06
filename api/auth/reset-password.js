const { findUserByResetToken, updatePassword, clearResetToken } = require('./store');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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
  } catch (err) {
    return res.status(500).json({ error: 'Failed to reset password' });
  }
};
