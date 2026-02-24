const { createSession, createUser, issueToken, setSessionCookie } = require('./store');

module.exports = function handler(req, res) {
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

  const user = createUser({ username, email, password });
  if (!user) {
    return res.status(409).json({ error: 'Username already taken' });
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
