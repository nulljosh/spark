const { posts, parseToken } = require('../../posts');

module.exports = function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = parseToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.query;
  const { voteType } = req.body || {};

  if (!voteType || !['up', 'down'].includes(voteType)) {
    return res.status(400).json({ error: 'voteType must be "up" or "down"' });
  }

  const post = posts.find(p => p.id === id);
  if (!post) {
    return res.status(404).json({ error: 'Post not found' });
  }

  if (voteType === 'up') {
    post.score += 1;
  } else {
    post.score -= 1;
  }

  return res.status(200).json({ post });
};
