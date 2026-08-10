const crypto = require('crypto');
const { createSession, createUser, issueToken, setSessionCookie, setVerifyToken } = require('../store');
const { sendMail, baseUrl } = require('../mail');

// Soft verification: we send the link when an email is on file, but never block
// the account. Email is optional at sign-up and the iOS/macOS clients expect a
// session back immediately, so a send failure must not fail registration.
async function sendVerifyEmail(username, email) {
  const token = crypto.randomBytes(32).toString('hex');
  await setVerifyToken(username, token);
  const link = `${baseUrl()}/api/auth?action=verify-email&token=${token}`;
  await sendMail({
    to: email,
    subject: 'Spark — Confirm your email',
    text: `Welcome to Spark.\n\nConfirm your email address:\n${link}\n\nIf you didn't create this account, ignore this email.`,
    html: `<p>Welcome to Spark.</p><p><a href="${link}">Confirm your email address</a></p><p>If you didn't create this account, ignore this email.</p>`,
  });
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, email, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const user = await createUser({ username, email, password });
  if (!user) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  if (email) {
    try {
      await sendVerifyEmail(user.username, email);
    } catch (err) {
      console.error('[register] verification email failed:', err && err.message);
    }
  }

  const token = issueToken(user);
  const session = createSession({ user, token });
  setSessionCookie(res, session.id);

  return res.status(201).json({
    token,
    username: user.username,
    userId: user.userId
  });
};
