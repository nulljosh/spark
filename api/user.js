const { supabaseRequest } = require('./lib/supabase');
const { rowToPost } = require('./posts');

module.exports = async function handler(req, res) {
  const { username } = req.query;
  
  if (!username || typeof username !== 'string') {
    return res.status(400).json({ error: 'Username required' });
  }

  try {
    // Fetch user
    const userRows = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}&select=id,username,created_at`);
    if (!Array.isArray(userRows) || userRows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    const user = userRows[0];
    
    // Fetch user's posts
    const postRows = await supabaseRequest(`posts?author_username=eq.${encodeURIComponent(username)}&select=*&order=created_at.desc`);
    const posts = Array.isArray(postRows) ? postRows.map(rowToPost) : [];
    
    // Calculate stats
    const totalUpvotes = posts.reduce((sum, p) => sum + (p.score || 0), 0);
    
    return res.status(200).json({
      user: {
        username: user.username,
        userId: user.id,
        joinedAt: user.created_at,
        postCount: posts.length,
        totalUpvotes
      },
      posts
    });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch user' });
  }
};
