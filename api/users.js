const { supabaseRequest } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rows = await supabaseRequest('users?select=id,username,created_at&order=created_at.desc');
    
    if (!Array.isArray(rows)) {
      return res.status(200).json({ users: [] });
    }
    
    const users = rows.map(u => ({
      userId: u.id,
      username: u.username,
      joinedAt: u.created_at
    }));
    
    return res.status(200).json({ users, count: users.length });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Failed to fetch users' });
  }
};
