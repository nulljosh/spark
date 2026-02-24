const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const USERS_FILE = '/tmp/spark-users.json';
const SESSIONS_FILE = '/tmp/spark-sessions.json';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function ensureDir(filePath) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
}

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    const raw = fs.readFileSync(filePath, 'utf-8');
    if (!raw.trim()) return fallback;
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function writeJson(filePath, data) {
  ensureDir(filePath);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function getUsers() {
  const users = readJson(USERS_FILE, []);
  return Array.isArray(users) ? users : [];
}

function saveUsers(users) {
  writeJson(USERS_FILE, users);
}

function getSessions() {
  const sessions = readJson(SESSIONS_FILE, []);
  return Array.isArray(sessions) ? sessions : [];
}

function saveSessions(sessions) {
  writeJson(SESSIONS_FILE, sessions);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}

function verifyPassword(password, user) {
  if (!user || !user.passwordHash || !user.passwordSalt) return false;
  const candidateHash = crypto.scryptSync(password, user.passwordSalt, 64).toString('hex');
  const expected = Buffer.from(user.passwordHash, 'hex');
  const actual = Buffer.from(candidateHash, 'hex');
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

function issueToken(user) {
  return Buffer.from(`${user.username}:${user.userId}`).toString('base64');
}

function findUserByUsername(username) {
  const users = getUsers();
  return users.find((u) => u.username === username) || null;
}

function deriveUser(username, password) {
  const input = `${String(username)}:${String(password)}`;
  const fingerprint = crypto.createHash('sha256').update(input).digest('hex');
  return {
    userId: `derived-${fingerprint.slice(0, 24)}`,
    username: String(username),
    email: null
  };
}

function createUser({ username, email, password }) {
  const users = getUsers();
  if (users.some((u) => u.username === username)) return null;

  const { salt, hash } = hashPassword(password);
  const user = {
    userId: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    username,
    email: email || null,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };

  users.push(user);
  saveUsers(users);
  return user;
}

function createSession({ user, token }) {
  const sessions = getSessions();
  const now = Date.now();
  const session = {
    id: crypto.randomBytes(24).toString('hex'),
    username: user.username,
    userId: user.userId,
    token,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };

  sessions.push(session);
  saveSessions(sessions);
  return session;
}

function resolveSession(sessionId) {
  if (!sessionId) return null;
  const sessions = getSessions();
  const now = Date.now();
  let changed = false;

  const active = sessions.filter((session) => {
    const expiresAt = Date.parse(session.expiresAt);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt > now;
  });

  if (active.length !== sessions.length) {
    changed = true;
  }

  const session = active.find((s) => s.id === sessionId) || null;
  if (changed) saveSessions(active);
  return session;
}

function parseCookie(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return acc;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    acc[key] = decodeURIComponent(value);
    return acc;
  }, {});
}

function setSessionCookie(res, sessionId) {
  const cookie = [
    `spark_session=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ].join('; ');

  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
    return;
  }
  if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
    return;
  }
  res.setHeader('Set-Cookie', [existing, cookie]);
}

module.exports = {
  createSession,
  createUser,
  deriveUser,
  findUserByUsername,
  issueToken,
  parseCookie,
  resolveSession,
  setSessionCookie,
  verifyPassword
};
