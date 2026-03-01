const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getSupabaseConfig, supabaseRequest } = require('../lib/supabase');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is required');
const JWT_EXPIRES_IN = '7d';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

function useSupabase() {
  const { url, key } = getSupabaseConfig();
  return !!(url && key);
}

// Password hashing (bcrypt -- matches existing Supabase data)
function hashPassword(password) {
  const hash = bcrypt.hashSync(password, BCRYPT_ROUNDS);
  return hash;
}

function verifyPassword(password, user) {
  if (!user || !user.passwordHash) return false;
  return bcrypt.compareSync(password, user.passwordHash);
}

// JWT token issuance
function issueToken(user) {
  return jwt.sign(
    { username: user.username, userId: user.userId },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT, with backward compat for old Base64 tokens
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { username: payload.username, userId: payload.userId };
  } catch {
    // Fall through to Base64 compat
  }

  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, userId] = decoded.split(':');
    if (username && userId) return { username, userId };
  } catch {
    // invalid
  }

  return null;
}

// Map Supabase user row to internal format
// Supabase schema: id (UUID), username, password (bcrypt), email, created_at, updated_at
function mapSupabaseUser(row) {
  if (!row) return null;
  return {
    userId: row.id,
    username: row.username,
    email: row.email || null,
    passwordHash: row.password,
    createdAt: row.created_at
  };
}

// User CRUD -- Supabase with /tmp fallback
async function findUserByUsername(username) {
  if (useSupabase()) {
    try {
      const rows = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}&select=*`);
      if (Array.isArray(rows) && rows.length > 0) return mapSupabaseUser(rows[0]);
    } catch {
      // fall through to /tmp
    }
  }
  return findUserLocal(username);
}

async function createUser({ username, email, password }) {
  const existing = await findUserByUsername(username);
  if (existing) return null;

  const hash = hashPassword(password);

  if (useSupabase()) {
    try {
      const rows = await supabaseRequest('users', {
        method: 'POST',
        body: {
          username,
          email: email || null,
          password: hash,
          created_at: new Date().toISOString()
        }
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return mapSupabaseUser(row);
    } catch {
      // fall through to /tmp
    }
  }

  const user = {
    userId: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    username,
    email: email || null,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };
  return createUserLocal(user);
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

// /tmp fallback storage (kept for when Supabase is not configured)
const fs = require('fs');
const path = require('path');
const USERS_FILE = '/tmp/spark-users.json';

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
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tempPath, filePath);
}

function findUserLocal(username) {
  const users = readJson(USERS_FILE, []);
  return (Array.isArray(users) ? users : []).find((u) => u.username === username) || null;
}

function createUserLocal(user) {
  const users = readJson(USERS_FILE, []);
  const arr = Array.isArray(users) ? users : [];
  arr.push(user);
  writeJson(USERS_FILE, arr);
  return user;
}

// Session management (kept for cookie-based auth)
const SESSIONS_FILE = '/tmp/spark-sessions.json';

function createSession({ user, token }) {
  const sessions = readJson(SESSIONS_FILE, []);
  const arr = Array.isArray(sessions) ? sessions : [];
  const now = Date.now();
  const session = {
    id: crypto.randomBytes(24).toString('hex'),
    username: user.username,
    userId: user.userId,
    token,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
  arr.push(session);
  writeJson(SESSIONS_FILE, arr);
  return session;
}

function resolveSession(sessionId) {
  if (!sessionId) return null;
  const sessions = readJson(SESSIONS_FILE, []);
  const arr = Array.isArray(sessions) ? sessions : [];
  const now = Date.now();
  const active = arr.filter((s) => {
    const expiresAt = Date.parse(s.expiresAt);
    return Number.isFinite(expiresAt) && expiresAt > now;
  });
  const session = active.find((s) => s.id === sessionId) || null;
  if (active.length !== arr.length) writeJson(SESSIONS_FILE, active);
  return session;
}

function parseCookie(cookieHeader) {
  if (!cookieHeader) return {};
  return cookieHeader.split(';').reduce((acc, part) => {
    const trimmed = part.trim();
    if (!trimmed) return acc;
    const idx = trimmed.indexOf('=');
    if (idx < 0) return acc;
    acc[trimmed.slice(0, idx)] = decodeURIComponent(trimmed.slice(idx + 1));
    return acc;
  }, {});
}

function setSessionCookie(res, sessionId) {
  const parts = [
    `spark_session=${encodeURIComponent(sessionId)}`,
    'Path=/',
    'HttpOnly',
    ...(process.env.NODE_ENV === 'production' ? ['Secure'] : []),
    'SameSite=Strict',
    `Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}`
  ];
  const cookie = parts.join('; ');

  const existing = res.getHeader('Set-Cookie');
  if (!existing) {
    res.setHeader('Set-Cookie', cookie);
  } else if (Array.isArray(existing)) {
    res.setHeader('Set-Cookie', [...existing, cookie]);
  } else {
    res.setHeader('Set-Cookie', [existing, cookie]);
  }
}

module.exports = {
  createSession,
  createUser,
  deriveUser,
  findUserByUsername,
  issueToken,
  verifyToken,
  parseCookie,
  resolveSession,
  setSessionCookie,
  verifyPassword
};
