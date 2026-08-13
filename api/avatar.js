const { put, del } = require('@vercel/blob');
const { parseCookie, resolveSession, verifyToken } = require('./_lib/store');
const { supabaseRequest } = require('./_lib/supabase');

function parseAuth(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) {
    const user = verifyToken(auth.slice(7));
    if (user) return user;
  }
  const cookies = parseCookie(req.headers.cookie);
  const session = resolveSession(cookies.spark_session);
  if (!session) return null;
  return { username: session.username, userId: session.userId };
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST required' });
  }

  const user = parseAuth(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const { image, format } = req.body || {};
  if (!image) return res.status(400).json({ error: 'image (base64) required' });

  const isSvg = format === 'svg';
  const ext = isSvg ? 'svg' : 'jpg';
  const contentType = isSvg ? 'image/svg+xml' : 'image/jpeg';

  try {
    const buffer = Buffer.from(image, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      return res.status(400).json({ error: 'Image too large (max 2MB)' });
    }

    const blob = await put(`spark-avatars/${user.userId}-${Date.now()}.${ext}`, buffer, {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });

    await supabaseRequest(
      `users?user_id=eq.${encodeURIComponent(user.userId)}`,
      { method: 'PATCH', body: { avatar_url: blob.url }, useServiceRole: true }
    );

    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    return res.status(200).json({ ok: true, avatarUrl: blob.url });
  } catch (err) {
    console.error('[avatar] Error:', err.message);
    return res.status(500).json({ error: err.message || 'Upload failed' });
  }
};
