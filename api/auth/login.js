const {
  createSession,
  deriveUser,
  findUserByUsername,
  issueToken,
  setSessionCookie,
  verifyPassword
} = require('./store');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const storedUser = findUserByUsername(username);
  let user = storedUser;

  if (!storedUser) {
    user = deriveUser(username, password);
  } else if (!verifyPassword(password, storedUser)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = issueToken(user);
  const session = createSession({ user, token });
  setSessionCookie(res, session.id);

  return res.status(200).json({
    token,
    username: user.username,
    userId: user.userId
  });
};
