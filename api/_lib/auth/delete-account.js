const { parseCookie, resolveSession, verifyToken } = require('../store');
const { supabaseRequest } = require('../supabase');

function parseToken(authHeader, cookieHeader) {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    if (user) return user;
  }

  const cookies = parseCookie(cookieHeader);
  const session = resolveSession(cookies.spark_session);
  if (!session) return null;
  return { username: session.username, userId: session.userId };
}

// Deletes the authenticated user's account row via the service-role key.
// Posts/comments are left attributed to the (now-deleted) user id, same as
// any forum's "deleted user" pattern -- no cascade exists in the schema and
// content isn't authored-content the user owns exclusively.
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const identity = parseToken(req.headers.authorization, req.headers.cookie);
  if (!identity) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    await supabaseRequest(`users?user_id=eq.${encodeURIComponent(identity.userId)}`, {
      method: 'DELETE',
      useServiceRole: true
    });
  } catch (err) {
    console.error('[DELETE-ACCOUNT] Failed:', err.message);
    return res.status(500).json({ error: 'Failed to delete account' });
  }

  res.setHeader('Set-Cookie', 'spark_session=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
  return res.status(200).json({ ok: true });
};
