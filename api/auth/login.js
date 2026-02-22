const { users } = require('./register');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const user = users.find(u => u.username === username);
  if (!user || user.password !== password) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = Buffer.from(`${user.username}:${user.userId}`).toString('base64');

  return res.status(200).json({
    token,
    username: user.username,
    userId: user.userId
  });
};
