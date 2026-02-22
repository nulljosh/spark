const posts = [
  {
    id: 'seed-1',
    title: 'Open-source AI coding assistant',
    content: 'A local-first coding assistant that runs entirely on your machine. No API keys, no subscriptions, just Claude via Ollama.',
    category: 'tech',
    author: { username: 'spark', userId: 'system' },
    score: 142,
    createdAt: '2026-01-15T08:00:00Z'
  },
  {
    id: 'seed-2',
    title: 'Micro-investment app for Gen Z',
    content: 'Round up every purchase to the nearest dollar and auto-invest the difference into a diversified ETF portfolio.',
    category: 'business',
    author: { username: 'spark', userId: 'system' },
    score: 87,
    createdAt: '2026-01-20T12:00:00Z'
  },
  {
    id: 'seed-3',
    title: 'Sleep tracking without a wearable',
    content: 'Use your phone mic + accelerometer passively to track sleep cycles and give you a morning score. Zero hardware required.',
    category: 'tech',
    author: { username: 'spark', userId: 'system' },
    score: 61,
    createdAt: '2026-02-01T09:30:00Z'
  }
];

function parseToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  try {
    const token = authHeader.slice(7);
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const [username, userId] = decoded.split(':');
    if (!username || !userId) return null;
    return { username, userId };
  } catch (e) {
    return null;
  }
}

module.exports = function handler(req, res) {
  if (req.method === 'GET') {
    const sorted = [...posts].sort((a, b) => b.score - a.score);
    return res.status(200).json({ posts: sorted });
  }

  if (req.method === 'POST') {
    const user = parseToken(req.headers.authorization);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { title, content, category } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const post = {
      id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title,
      content,
      category: category || 'tech',
      author: { username: user.username, userId: user.userId },
      score: 0,
      createdAt: new Date().toISOString()
    };

    posts.push(post);
    return res.status(201).json({ post });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// Export posts array so vote handler can access it
module.exports.posts = posts;
module.exports.parseToken = parseToken;
