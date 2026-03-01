const { supabaseRequest } = require('./lib/supabase');

const seedPosts = [
  {
    id: 'seed-1',
    title: 'Open-source AI coding assistant',
    content: 'A local-first coding assistant that runs entirely on your machine. No API keys, no subscriptions, just Claude via Ollama.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 142,
    created_at: '2026-01-15T08:00:00Z'
  },
  {
    id: 'seed-2',
    title: 'Micro-investment app for Gen Z',
    content: 'Round up every purchase to the nearest dollar and auto-invest the difference into a diversified ETF portfolio.',
    category: 'business',
    author_username: 'spark',
    author_user_id: 'system',
    score: 87,
    created_at: '2026-01-20T12:00:00Z'
  },
  {
    id: 'seed-3',
    title: 'Sleep tracking without a wearable',
    content: 'Use your phone mic + accelerometer passively to track sleep cycles and give you a morning score. Zero hardware required.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 61,
    created_at: '2026-02-01T09:30:00Z'
  }
];

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
