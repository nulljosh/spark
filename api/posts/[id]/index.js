const { parseToken } = require('../../posts');
const { supabaseRequest } = require('../../lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'DELETE') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = parseToken(req.headers.authorization, req.headers.cookie);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.query;
  if (!id) {
    return res.status(400).json({ error: 'Post ID required' });
  }

  try {
    // Fetch the post to verify ownership
    const rows = await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}&select=*`);
    const post = Array.isArray(rows) ? rows[0] : null;

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (post.author_user_id !== user.userId) {
      return res.status(403).json({ error: 'You can only delete your own posts' });
    }

    await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, {
      method: 'DELETE'
    });

    return res.status(200).json({ deleted: true });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to delete post' });
  }
};
