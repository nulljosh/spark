const crypto = require('crypto');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'spark-dev-secret-change-in-production';
const JWT_EXPIRES_IN = '7d';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// Supabase helpers
function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;
  return { url, key };
}

async function supabaseRequest(path, { method = 'GET', body } = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('supabase_not_configured');

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = (data && (data.message || data.error || JSON.stringify(data))) || `supabase_http_${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

function useSupabase() {
  const { url, key } = getSupabaseConfig();
  return !!(url && key);
}

// Password hashing (scrypt)
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
  // Try JWT first
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return { username: payload.username, userId: payload.userId };
  } catch {
    // Fall through to Base64 compat
  }

  // Backward compat: decode old Base64 tokens
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, userId] = decoded.split(':');
    if (username && userId) return { username, userId };
  } catch {
    // invalid
  }

  return null;
}

// User CRUD -- Supabase with /tmp fallback
async function findUserByUsername(username) {
  if (useSupabase()) {
    try {
      const rows = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}&select=*`);
      return (Array.isArray(rows) && rows.length > 0) ? rows[0] : null;
    } catch {
      // fall through to /tmp
    }
  }
  return findUserLocal(username);
}

async function createUser({ username, email, password }) {
  // Check if exists
  const existing = await findUserByUsername(username);
  if (existing) return null;

  const { salt, hash } = hashPassword(password);
  const user = {
    userId: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
    username,
    email: email || null,
    passwordSalt: salt,
    passwordHash: hash,
    createdAt: new Date().toISOString()
  };

  if (useSupabase()) {
    try {
      const rows = await supabaseRequest('users', {
        method: 'POST',
        body: {
          user_id: user.userId,
          username: user.username,
          email: user.email,
          password_salt: user.passwordSalt,
          password_hash: user.passwordHash,
          created_at: user.createdAt
        }
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return {
        userId: row.user_id,
        username: row.username,
        email: row.email,
        passwordSalt: row.password_salt,
        passwordHash: row.password_hash,
        createdAt: row.created_at
      };
    } catch {
      // fall through to /tmp
    }
  }

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
