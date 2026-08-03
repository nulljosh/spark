const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { supabaseRequest } = require('../supabase');
const { createSession, issueToken, setSessionCookie } = require('../store');

const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_JWKS_URL = 'https://appleid.apple.com/auth/keys';
const JWKS_TTL_MS = 60 * 60 * 1000;

// ponytail: module-level cache. Worst case each cold instance fetches the
// JWKS once an hour — shared cache only if Apple starts rate-limiting, which
// at this traffic it will not.
let jwksCache = { keys: null, fetchedAt: 0 };

async function fetchJwks() {
  const res = await fetch(APPLE_JWKS_URL);
  if (!res.ok) throw new Error(`apple_jwks_http_${res.status}`);
  const data = await res.json();
  if (!data || !Array.isArray(data.keys)) throw new Error('apple_jwks_malformed');
  return data.keys;
}

async function getJwks({ force = false } = {}) {
  const fresh = Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS;
  if (!force && jwksCache.keys && fresh) return jwksCache.keys;
  const keys = await fetchJwks();
  jwksCache = { keys, fetchedAt: Date.now() };
  return keys;
}

// Verify an Apple identity token against a JWKS set.
// Exported so the self-check can drive it with a locally generated keypair.
function verifyIdentityToken(token, { jwks, audience, clockTimestamp } = {}) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || !decoded.header || !decoded.header.kid) {
    const err = new Error('apple_token_malformed');
    err.code = 'malformed';
    throw err;
  }

  const jwk = (jwks || []).find((k) => k.kid === decoded.header.kid);
  if (!jwk) {
    const err = new Error('apple_token_unknown_kid');
    err.code = 'unknown_kid';
    throw err;
  }

  const publicKey = crypto.createPublicKey({ key: jwk, format: 'jwk' });

  // `audience` accepts an array so a future web (Services ID) flow can be
  // added alongside the native bundle-ID audience without touching this.
  return jwt.verify(token, publicKey, {
    algorithms: ['RS256'],
    issuer: APPLE_ISSUER,
    audience,
    clockTolerance: 30,
    ...(clockTimestamp ? { clockTimestamp } : {})
  });
}

function parseAudience() {
  // Native Sign in with Apple sets `aud` to the app's BUNDLE ID
  // (com.heyitsmejosh.spark). A web flow would use a Services ID instead —
  // comma-separate APPLE_CLIENT_ID to allow both.
  const raw = (process.env.APPLE_CLIENT_ID || '').trim();
  return raw ? raw.split(',').map((s) => s.trim()).filter(Boolean) : [];
}

function sanitizeUsername(base) {
  return String(base || '').replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24) || 'user';
}

async function pickUniqueUsername(base, suffixSource) {
  let username = sanitizeUsername(base);
  const existing = await supabaseRequest(
    `users?username=eq.${encodeURIComponent(username)}&select=id`,
    { useServiceRole: true }
  ).catch(() => []);
  if (Array.isArray(existing) && existing.length > 0) {
    username = `${username}_${String(suffixSource).slice(-4)}`;
  }
  return username;
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const audience = parseAudience();
  if (audience.length === 0) {
    // Never fall back to a stub success — a broken auth path must look broken.
    console.error('[APPLE AUTH] missing required env var APPLE_CLIENT_ID');
    return res.status(500).json({ error: 'Apple Sign In is misconfigured' });
  }

  const { identityToken, fullName, email: clientEmail } = req.body || {};
  if (!identityToken) {
    return res.status(400).json({ error: 'identityToken is required' });
  }

  let payload;
  try {
    let jwks = await getJwks();
    try {
      payload = verifyIdentityToken(identityToken, { jwks, audience });
    } catch (err) {
      // Apple rotates signing keys; one forced refresh covers a rotation
      // that happened since our cached copy.
      if (err.code === 'unknown_kid') {
        jwks = await getJwks({ force: true });
        payload = verifyIdentityToken(identityToken, { jwks, audience });
      } else {
        throw err;
      }
    }
  } catch (err) {
    console.error('[APPLE AUTH] token verification failed:', err.message);
    return res.status(401).json({ error: 'Invalid Apple credentials' });
  }

  const appleId = payload.sub;
  if (!appleId) {
    return res.status(401).json({ error: 'Invalid Apple credentials' });
  }

  // Apple only returns email/name on the FIRST authorization. Every later
  // sign-in carries just `sub`, so stored values are the source of truth and
  // the client-supplied ones are a first-run fallback only.
  const email = payload.email || clientEmail || null;

  try {
    let rows = await supabaseRequest(
      `users?apple_id=eq.${encodeURIComponent(appleId)}&select=*`,
      { useServiceRole: true }
    ).catch(() => []);
    let user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (!user && email) {
      // Link to an existing account that already owns this email.
      rows = await supabaseRequest(
        `users?email=eq.${encodeURIComponent(email)}&select=*`,
        { useServiceRole: true }
      ).catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) {
        user = rows[0];
        await supabaseRequest(`users?id=eq.${user.id}`, {
          method: 'PATCH',
          useServiceRole: true,
          body: { apple_id: appleId }
        }).catch(() => {});
      }
    }

    if (!user) {
      const nameSeed =
        (fullName && (fullName.givenName || fullName.familyName)
          ? `${fullName.givenName || ''}${fullName.familyName || ''}`
          : null) ||
        (email ? email.split('@')[0] : null) ||
        `apple_${appleId.slice(-6)}`;

      const username = await pickUniqueUsername(nameSeed, appleId);
      const userId = `ap-${crypto.randomBytes(8).toString('hex')}`;

      const newRows = await supabaseRequest('users', {
        method: 'POST',
        useServiceRole: true,
        body: {
          user_id: userId,
          username,
          email,
          apple_id: appleId,
          password_hash: null,
          password_salt: null,
          created_at: new Date().toISOString()
        }
      });
      user = Array.isArray(newRows) ? newRows[0] : newRows;
    }

    if (!user) {
      return res.status(500).json({ error: 'Could not create account' });
    }

    const mapped = {
      userId: user.user_id || user.id,
      username: user.username,
      email: user.email
    };
    const token = issueToken(mapped);
    const session = createSession({ user: mapped, token });
    setSessionCookie(res, session.id);

    return res.status(200).json({
      token,
      username: mapped.username,
      userId: mapped.userId
    });
  } catch (err) {
    console.error('[APPLE AUTH]', err.message);
    return res.status(500).json({ error: 'Apple Sign In failed' });
  }
};

module.exports.verifyIdentityToken = verifyIdentityToken;
module.exports.APPLE_ISSUER = APPLE_ISSUER;
