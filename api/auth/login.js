const {
  createSession,
  findUserByUsername,
  issueToken,
  setSessionCookie,
  verifyPassword
} = require('./store');

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 10;
// In-memory limiter is acceptable for this low-traffic app, but it resets on cold start.
const loginAttemptsByIp = new Map();

function getClientIp(req) {
  const forwardedFor = req.headers['x-forwarded-for'];

  if (typeof forwardedFor === 'string' && forwardedFor.trim()) {
    return forwardedFor.split(',')[0].trim();
  }

  return req.socket?.remoteAddress || 'unknown';
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const clientIp = getClientIp(req);
  const now = Date.now();
  const recentAttempts = (loginAttemptsByIp.get(clientIp) || []).filter(
    (timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS
  );

  if (recentAttempts.length >= RATE_LIMIT_MAX_ATTEMPTS) {
    loginAttemptsByIp.set(clientIp, recentAttempts);
    return res.status(429).json({ error: 'Too many login attempts. Try again later.' });
  }

  recentAttempts.push(now);
  loginAttemptsByIp.set(clientIp, recentAttempts);

  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const storedUser = await findUserByUsername(username);

  if (!storedUser) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  if (!verifyPassword(password, storedUser)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }

  const token = issueToken(storedUser);
  const session = createSession({ user: storedUser, token });
  setSessionCookie(res, session.id);

  return res.status(200).json({
    token,
    username: storedUser.username,
    userId: storedUser.userId
  });
};
