const users = [];

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

  const existing = users.find(u => u.username === username);
  if (existing) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const userId = 'user-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const user = { username, email: email || null, password, userId };
  users.push(user);

  const token = Buffer.from(`${username}:${userId}`).toString('base64');

  return res.status(201).json({
    token,
    username,
    userId
  });
};

module.exports.users = users;
