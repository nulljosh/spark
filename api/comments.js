const { parseToken } = require('./posts');
const { supabaseRequest } = require('./_lib/supabase');
const { getIp, checkRateLimit } = require('./_lib/ratelimit');

async function getComments(postId) {
  const rows = await supabaseRequest(
    `comments?post_id=eq.${encodeURIComponent(postId)}&select=*&order=created_at.desc`
  );
  return Array.isArray(rows) ? rows : [];
}

async function getCommentCounts(postIds) {
  // Fetch all comments for the given post IDs and count client-side
  // Supabase REST doesn't support group-by natively
  const filter = postIds.map(id => `post_id.eq.${encodeURIComponent(id)}`).join(',');
  const rows = await supabaseRequest(
    `comments?or=(${filter})&select=post_id`
  );
  const counts = {};
  if (Array.isArray(rows)) {
    for (const r of rows) {
      counts[r.post_id] = (counts[r.post_id] || 0) + 1;
    }
  }
  return counts;
}

async function addComment({ postId, content, user }) {
  const comment = {
    id: 'cmt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    post_id: postId,
    user_id: user.userId,
    username: user.username,
    content,
    created_at: new Date().toISOString()
  };
  const rows = await supabaseRequest('comments', {
    method: 'POST',
    // Same as posts: authenticated_insert_comments admits only the
    // `authenticated` role, and this app's own JWT auth means Supabase sees
    // `anon`, so inserts were blocked by RLS.
    useServiceRole: true,
    body: comment
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row || comment;
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    if (req.query.post_ids) {
      const postIds = req.query.post_ids.split(',').filter(Boolean);
      if (postIds.length === 0) return res.status(400).json({ error: 'post_ids is required' });
      try {
        const counts = await getCommentCounts(postIds);
        return res.status(200).json({ counts });
      } catch (err) {
        console.error('[COMMENTS] Count fetch failed:', err.message);
        return res.status(500).json({ error: 'Failed to fetch comment counts' });
      }
    }

    const postId = req.query.post_id;
    if (!postId) return res.status(400).json({ error: 'post_id is required' });

    try {
      const comments = await getComments(postId);
      return res.status(200).json({ comments });
    } catch (err) {
      console.error('[COMMENTS] Fetch failed:', err.message);
      return res.status(500).json({ error: 'Failed to fetch comments' });
    }
  }

  if (req.method === 'POST') {
    const user = parseToken(req.headers.authorization, req.headers.cookie);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!checkRateLimit('comment:' + getIp(req), 10, 60_000)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { post_id, content } = req.body || {};
    if (!post_id || !content) return res.status(400).json({ error: 'post_id and content are required' });
    if (typeof content !== 'string' || content.length > 2000) return res.status(400).json({ error: 'Comment too long (max 2000)' });

    try {
      const comment = await addComment({ postId: post_id, content, user });
      return res.status(201).json({ comment });
    } catch (err) {
      console.error('[COMMENTS] Add failed:', err.message);
      return res.status(500).json({ error: 'Failed to add comment' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.getComments = getComments;
module.exports.getCommentCounts = getCommentCounts;
module.exports.addComment = addComment;
