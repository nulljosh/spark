const { supabaseRequest } = require('./lib/supabase');
const { seedPosts } = require('./posts');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const rows = await supabaseRequest('posts?select=*');
    
    // Only seed if empty
    if (!Array.isArray(rows) || rows.length === 0) {
      let seeded = 0;
      for (const seed of seedPosts) {
        try {
          await supabaseRequest('posts', { method: 'POST', body: seed });
          seeded++;
        } catch (e) {
          // skip if exists
        }
      }
      return res.status(200).json({ message: `Seeded ${seeded} posts`, seeded });
    }
    
    return res.status(200).json({ message: 'Database already has posts', count: rows.length });
  } catch (err) {
    return res.status(500).json({ error: err.message || 'Seed failed' });
  }
};
