const { parseCookie, resolveSession, verifyToken } = require('./auth/store');
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

function parseToken(authHeader, cookieHeader) {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    if (user) return user;
  }

  const cookies = parseCookie(cookieHeader);
  const session = resolveSession(cookies.spark_session);
  if (!session) return null;
  return { username: session.username, userId: session.userId };
}

function rowToPost(r) {
  return {
    id: r.id,
    title: r.title,
    content: r.content,
    category: r.category || 'tech',
    author: {
      username: r.author_username || 'spark',
      userId: r.author_user_id || 'system'
    },
    score: Number.isFinite(r.score) ? r.score : 0,
    createdAt: r.created_at || new Date().toISOString()
  };
}

async function getPostsFromDataSource() {
  const rows = await supabaseRequest('posts?select=*&order=score.desc,created_at.desc');

  if (!Array.isArray(rows) || rows.length === 0) {
    // Seed Supabase with demo data
    for (const seed of seedPosts) {
      try {
        await supabaseRequest(`posts?id=eq.${encodeURIComponent(seed.id)}`, { method: 'GET' }).then(async (existing) => {
          if (!Array.isArray(existing) || existing.length === 0) {
            await supabaseRequest('posts', { method: 'POST', body: seed });
          }
        });
      } catch { /* skip duplicates */ }
    }
    // Re-fetch after seeding
    const seeded = await supabaseRequest('posts?select=*&order=score.desc,created_at.desc');
    return { posts: (Array.isArray(seeded) ? seeded : []).map(rowToPost) };
  }

  return { posts: rows.map(rowToPost) };
}

async function addPostToDataSource({ title, content, category, user }) {
  const post = {
    title,
    content,
    category: category || 'tech',
    author: { username: user.username, userId: user.userId },
    score: 0,
    createdAt: new Date().toISOString()
  };

  const rows = await supabaseRequest('posts', {
    method: 'POST',
    body: {
      id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: post.title,
      content: post.content,
      category: post.category,
      author_username: user.username,
      author_user_id: user.userId,
      score: 0,
      created_at: post.createdAt
    }
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  post.id = row.id;
  return { post };
}

async function votePostInDataSource({ id, voteType, user }) {
  if (!user) throw new Error('Authentication required');

  const rows = await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}&select=*`);
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) throw new Error('not_found');

  const delta = voteType === 'up' ? 1 : -1;
  const newScore = (row.score || 0) + delta;

  await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: { score: newScore }
  });

  return { post: rowToPost({ ...row, score: newScore }) };
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    try {
      const { posts } = await getPostsFromDataSource();
      return res.status(200).json({ posts });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to load posts' });
    }
  }

  if (req.method === 'POST') {
    const user = parseToken(req.headers.authorization, req.headers.cookie);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { title, content, category } = req.body || {};
    if (typeof title !== 'string' || title.length > 200) return res.status(400).json({ error: 'Title too long (max 200)' });
    if (typeof content !== 'string' || content.length > 5000) return res.status(400).json({ error: 'Content too long (max 5000)' });
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    try {
      const { post } = await addPostToDataSource({ title, content, category, user });
      return res.status(201).json({ post });
    } catch (err) {
      return res.status(500).json({ error: err.message || 'Failed to create post' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.seedPosts = seedPosts;
module.exports.parseToken = parseToken;
module.exports.votePostInDataSource = votePostInDataSource;
