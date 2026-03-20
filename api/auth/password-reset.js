const crypto = require('crypto');
const nodemailer = require('nodemailer');
const { findUserByUsername, findUserByEmail, setResetToken, findUserByResetToken, updatePassword, clearResetToken } = require('./store');

const GENERIC_MESSAGE = 'If an account exists with that info, a reset link has been sent.';

// Configure SMTP transport — set these env vars:
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM
// For Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=587, SMTP_USER=you@gmail.com, SMTP_PASS=app-password
function getTransport() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

async function sendResetEmail(email, token) {
  const transport = getTransport();
  if (!transport) {
    console.warn('[password-reset] SMTP not configured — skipping email send');
    return;
  }
  const baseUrl = process.env.APP_URL || 'https://spark.heyitsmejosh.com';
  const resetLink = `${baseUrl}/reset-password?token=${token}`;
  const from = process.env.SMTP_FROM || process.env.SMTP_USER;
  await transport.sendMail({
    from,
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
    const { username, email } = req.body || {};
    if (!username && !email) {
      return res.status(400).json({ error: 'Username or email is required' });
    }
    try {
      let user = null;
      if (username) user = await findUserByUsername(username);
      if (!user && email) user = await findUserByEmail(email);
      if (user && user.email) {
        const token = crypto.randomBytes(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000);
        await setResetToken(user.username, token, expires);
        await sendResetEmail(user.email, token);
      }
    } catch (err) {
      console.error('[password-reset] Error:', err.message);
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
