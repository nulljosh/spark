const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { getSupabaseConfig, supabaseRequest } = require('../_lib/supabase');

// Read lazily, not at module load. On Vercel env vars exist when the module is
// first required; on Cloudflare Workers bindings are only attached per-request,
// so a top-level read threw "JWT_SECRET environment variable is required" at
// isolate startup and took down every route, including ones that never sign a
// token. Still fails loud — just at first use rather than at boot, so a missing
// secret is a 500 on the auth path instead of a dead worker.
function jwtSecret() {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is required');
  return secret;
}
const JWT_EXPIRES_IN = '7d';
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const BCRYPT_ROUNDS = 10;

function useSupabase() {
  // getSupabaseConfig returns { url, anonKey, serviceRoleKey } -- there is no
  // `key` property. Destructuring `key` yielded undefined, so this always
  // returned false and EVERY auth path silently skipped Supabase for the
  // ephemeral /tmp store. Accounts never persisted, which is what App Review
  // hit as "unable to sign up or sign in". posts.js was unaffected because it
  // calls supabaseRequest directly rather than gating on this.
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  return !!(url && (anonKey || serviceRoleKey));
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
    jwtSecret(),
    { expiresIn: JWT_EXPIRES_IN }
  );
}

// Verify JWT. Only signed tokens are accepted -- the old unsigned Base64
// fallback was removed (it let anyone forge any identity by base64-encoding
// "username:userId", with userId being public in the posts feed).
function verifyToken(token) {
  try {
    const payload = jwt.verify(token, jwtSecret());
    return { username: payload.username, userId: payload.userId };
  } catch {
    return null;
  }
}

// Map Supabase user row to internal format
// Supabase schema: id (UUID), username, password (bcrypt), email, created_at, updated_at
function mapSupabaseUser(row) {
  if (!row) return null;
  return {
    // Prefer the app-level user_id over the serial PK, matching the GitHub and
    // Apple paths (`user.user_id || user.id`). Returning row.id gave
    // email-registered users a numeric id while OAuth users got a string one.
    userId: row.user_id || row.id,
    username: row.username,
    email: row.email || null,
    passwordHash: row.password_hash || row.password,
    verified: row.verified ?? false,
    createdAt: row.created_at
  };
}

// User CRUD -- Supabase with /tmp fallback
async function findUserByUsername(username) {
  if (useSupabase()) {
    try {
      // Service role required: this reads password_hash to verify logins, and the
      // anon role no longer holds column privileges on the sensitive columns.
      const rows = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}&select=*`, { useServiceRole: true });
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
      // useServiceRole is required: RLS policy no_direct_write_users blocks all
      // anon INSERTs on users. Without it this threw and silently fell through
      // to /tmp, which on Vercel is per-instance and ephemeral -- so email
      // sign-ups appeared to succeed and then vanished. Matches the GitHub and
      // Apple paths, which already do this.
      const rows = await supabaseRequest('users', {
        method: 'POST',
        useServiceRole: true,
        body: {
          // user_id is NOT NULL with no default; omitting it violated the
          // constraint even when RLS was satisfied.
          user_id: `user-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`,
          username,
          email: email || null,
          password_hash: hash,
          password_salt: null,
          created_at: new Date().toISOString()
        }
      });
      const row = Array.isArray(rows) ? rows[0] : rows;
      return mapSupabaseUser(row);
    } catch (err) {
      // Do NOT swallow this silently. A failure here falls through to the /tmp
      // store, which on Vercel is per-instance and ephemeral -- the account
      // looks created and then does not exist. That silent fallback is what
      // hid a production-wide sign-up outage until App Review caught it.
      console.error('[AUTH] Supabase createUser failed, falling back to /tmp:', err && err.message);
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

// The /tmp user store is gone. Workers has no filesystem, and on Vercel it was
// actively harmful: /tmp is per-instance and ephemeral, so an account created
// through this path existed only on the instance that served the request and
// vanished immediately afterwards. Sign-ups appeared to succeed and then did
// not exist — the exact failure App Review reported as "unable to sign up or
// sign in", and what several comments above are working around.
//
// Supabase is now the only real user store. The in-memory map below exists so
// the auth tests have something to write to; it is opt-in via
// SPARK_ALLOW_MEMORY_STORE=1 and must never be set in production, where a
// missing Supabase config has to fail loudly rather than silently "succeed".
const memoryUsers = new Map();

function memoryStoreEnabled() {
  return process.env.SPARK_ALLOW_MEMORY_STORE === '1';
}

function _resetMemoryStore() {
  memoryUsers.clear();
}

function findUserLocal(username) {
  if (!memoryStoreEnabled()) return null;
  return memoryUsers.get(username) || null;
}

function createUserLocal(user) {
  if (!memoryStoreEnabled()) {
    throw new Error('user_store_unavailable: Supabase is not configured');
  }
  memoryUsers.set(user.username, user);
  return user;
}

// Session management — stateless, backed by the signed JWT itself.
//
// Was a /tmp/spark-sessions.json file. That could not move to Workers (no
// filesystem), and it was already broken on Vercel: /tmp is per-instance and
// ephemeral, so a login handled by one instance produced a cookie that every
// other instance rejected. Sessions "randomly" vanished — the same silent
// fallback this file's other comments blame for the App Review sign-in failures.
//
// The cookie now carries the JWT that issueToken() already mints, so resolving a
// session is just verifying that token. Same 7-day lifetime (JWT_EXPIRES_IN),
// same HttpOnly cookie, no shared state, nothing to expire-sweep. Call sites are
// unchanged: createSession still returns { id, username, userId, ... } and
// callers still pass session.id to setSessionCookie.
function createSession({ user, token }) {
  const now = Date.now();
  return {
    id: token,
    username: user.username,
    userId: user.userId,
    token,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + SESSION_TTL_MS).toISOString()
  };
}

function resolveSession(sessionId) {
  if (!sessionId) return null;
  // verifyToken returns null on a bad/expired signature, which is exactly the
  // "no active session" contract the old lookup had.
  const payload = verifyToken(sessionId);
  if (!payload) return null;
  return { id: sessionId, token: sessionId, username: payload.username, userId: payload.userId };
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

// Find user by email (Supabase only)
async function findUserByEmail(email) {
  if (!email || !useSupabase()) return null;
  try {
    // Service role required: filters on `email` and reads password_hash, both of
    // which the anon role no longer has column privileges for.
    const rows = await supabaseRequest(`users?email=eq.${encodeURIComponent(email)}&select=*`, { useServiceRole: true });
    if (Array.isArray(rows) && rows.length > 0) return mapSupabaseUser(rows[0]);
  } catch {
    // fall through
  }
  return null;
}

// Set reset token on user (Supabase only -- /tmp fallback not supported for resets)
async function setResetToken(username, token, expires) {
  if (!useSupabase()) return false;
  await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    useServiceRole: true,
    body: { reset_token: token, reset_token_expires: expires.toISOString() }
  });
  return true;
}

// Find user by reset token (validates expiry)
async function findUserByResetToken(token) {
  if (!token || !useSupabase()) return null;
  try {
    // Service role required: filters on `reset_token`, which anon can no longer read.
    const rows = await supabaseRequest(`users?reset_token=eq.${encodeURIComponent(token)}&select=*`, { useServiceRole: true });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    const row = rows[0];
    if (row.reset_token_expires && new Date(row.reset_token_expires) < new Date()) return null;
    return mapSupabaseUser(row);
  } catch {
    return null;
  }
}

// Clear reset token after use
async function clearResetToken(username) {
  if (!useSupabase()) return false;
  await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    useServiceRole: true,
    body: { reset_token: null, reset_token_expires: null }
  });
  return true;
}

// Email verification tokens (Supabase only, same as reset tokens above).
// ponytail: no expiry — an unverified account is not privileged, so a stale
// verify link costs nothing. Add an expires column if that changes.
async function setVerifyToken(username, token) {
  if (!useSupabase()) return false;
  await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    useServiceRole: true,
    body: { verify_token: token }
  });
  return true;
}

async function findUserByVerifyToken(token) {
  if (!token || !useSupabase()) return null;
  try {
    const rows = await supabaseRequest(`users?verify_token=eq.${encodeURIComponent(token)}&select=*`, { useServiceRole: true });
    if (!Array.isArray(rows) || rows.length === 0) return null;
    return mapSupabaseUser(rows[0]);
  } catch {
    return null;
  }
}

// Consumes the token, so a link only works once.
async function markVerified(username) {
  if (!useSupabase()) return false;
  await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`, {
    method: 'PATCH',
    useServiceRole: true,
    body: { verified: true, verify_token: null }
  });
  return true;
}

// Update password hash
async function updatePassword(username, newPassword) {
  const hash = hashPassword(newPassword);
  if (useSupabase()) {
    await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}`, {
      method: 'PATCH',
      useServiceRole: true,
      body: { password_hash: hash }
    });
    return true;
  }
  // /tmp fallback
  const users = readJson(USERS_FILE, []);
  const arr = Array.isArray(users) ? users : [];
  const user = arr.find((u) => u.username === username);
  if (user) {
    user.passwordHash = hash;
    writeJson(USERS_FILE, arr);
    return true;
  }
  return false;
}

function isDaemon(req) {
  const secret = process.env.SPARK_DAEMON_SECRET;
  return secret && req.headers['x-daemon-secret'] === secret;
}

module.exports = {
  clearResetToken,
  createSession,
  createUser,
  deriveUser,
  findUserByEmail,
  findUserByResetToken,
  findUserByUsername,
  findUserByVerifyToken,
  isDaemon,
  issueToken,
  markVerified,
  setVerifyToken,
  updatePassword,
  verifyToken,
  parseCookie,
  resolveSession,
  setResetToken,
  setSessionCookie,
  verifyPassword,
  // test-only seam, see memoryStoreEnabled
  _resetMemoryStore
};
