const { parseToken, votePostInDataSource } = require('../../posts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = parseToken(req.headers.authorization, req.headers.cookie);
  if (!user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const { id } = req.query;
  const { voteType } = req.body || {};

  if (!voteType || !['up', 'down'].includes(voteType)) {
    return res.status(400).json({ error: 'voteType must be "up" or "down"' });
  }

  try {
    const { post } = await votePostInDataSource({ id, voteType, user });
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }
    return res.status(200).json({ post });
  } catch (err) {
    if (err.message === 'not_found') return res.status(404).json({ error: 'Post not found' });
    return res.status(500).json({ error: err.message || 'Failed to vote' });
  }
};
