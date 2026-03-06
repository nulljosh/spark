const crypto = require('crypto');
const { findUserByUsername, findUserByEmail, setResetToken } = require('./store');

const GENERIC_MESSAGE = 'If an account exists with that info, a reset link has been sent.';

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, email } = req.body || {};

  if (!username && !email) {
    return res.status(400).json({ error: 'Username or email is required' });
  }

  try {
    let user = null;
    if (username) {
      user = await findUserByUsername(username);
    }
    if (!user && email) {
      user = await findUserByEmail(email);
    }

    if (user) {
      const token = crypto.randomBytes(32).toString('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
      await setResetToken(user.username, token, expires);

      // TODO: Send email with reset link
      // const resetUrl = `https://spark.heyitsmejosh.com/reset.html?token=${token}`;
      // await sendEmail(user.email, 'Password Reset', `Reset your password: ${resetUrl}`);
    }
  } catch {
    // Swallow errors -- always return generic message
  }

  return res.status(200).json({ message: GENERIC_MESSAGE });
};
