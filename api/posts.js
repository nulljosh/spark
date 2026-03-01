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
  },
  {
    id: 'idea-4',
    title: 'Collaborative coding whiteboard',
    content: 'Real-time code editor with integrated design tools. Pair programming for architecture, with visual diagrams that compile to code.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 54,
    created_at: '2026-02-03T10:15:00Z'
  },
  {
    id: 'idea-5',
    title: 'Personal carbon footprint tracker',
    content: 'Log flights, purchases, energy use. Get weekly insights and offsets. Gamified with friends. Carbon-negative by design.',
    category: 'sustainability',
    author_username: 'spark',
    author_user_id: 'system',
    score: 38,
    created_at: '2026-02-05T14:22:00Z'
  },
  {
    id: 'idea-6',
    title: 'AI recipe generator from fridge contents',
    content: 'Take a photo of your fridge. Get recipe suggestions ranked by simplicity. Integrate with grocery delivery APIs.',
    category: 'productivity',
    author_username: 'spark',
    author_user_id: 'system',
    score: 72,
    created_at: '2026-02-07T09:30:00Z'
  },
  {
    id: 'idea-7',
    title: 'Decentralized task marketplace',
    content: 'Post micro-tasks (design, writing, coding). Get bids instantly. Pay with crypto/stablecoins. Zero middleman.',
    category: 'business',
    author_username: 'spark',
    author_user_id: 'system',
    score: 91,
    created_at: '2026-02-08T16:45:00Z'
  },
  {
    id: 'idea-8',
    title: 'Mental health chatbot with local LLM',
    content: 'Privacy-first therapy companion. Runs entirely on your device. No cloud, no logs, no surveillance.',
    category: 'health',
    author_username: 'spark',
    author_user_id: 'system',
    score: 103,
    created_at: '2026-02-09T11:20:00Z'
  },
  {
    id: 'idea-9',
    title: 'Podcast transcript + AI notes + highlights',
    content: 'Auto-transcribe from RSS feeds. Extract key moments. Generate study notes. Export to Obsidian.',
    category: 'productivity',
    author_username: 'spark',
    author_user_id: 'system',
    score: 67,
    created_at: '2026-02-10T13:00:00Z'
  },
  {
    id: 'idea-10',
    title: 'Stock sentiment analyzer from social',
    content: 'Track mentions across Reddit, Twitter, Discord. Correlate with price action. Alert on unusual sentiment spikes.',
    category: 'finance',
    author_username: 'spark',
    author_user_id: 'system',
    score: 84,
    created_at: '2026-02-11T08:30:00Z'
  },
  {
    id: 'idea-11',
    title: 'Habit stacking accountability group',
    content: 'Build tiny habits with friends. Daily check-ins via SMS. Win streaks unlock rewards.',
    category: 'health',
    author_username: 'spark',
    author_user_id: 'system',
    score: 45,
    created_at: '2026-02-12T19:15:00Z'
  },
  {
    id: 'idea-12',
    title: 'Dynamic pricing engine for creators',
    content: 'Gumroad alternative. ML-based price optimization per customer. Recover revenue from price-sensitive users.',
    category: 'business',
    author_username: 'spark',
    author_user_id: 'system',
    score: 56,
    created_at: '2026-02-13T10:45:00Z'
  },
  {
    id: 'idea-13',
    title: 'Browser history search with local embeddings',
    content: 'Full-text search across your entire browsing history. No cloud, instant results. Find that article from months ago.',
    category: 'productivity',
    author_username: 'spark',
    author_user_id: 'system',
    score: 79,
    created_at: '2026-02-14T15:30:00Z'
  },
  {
    id: 'idea-14',
    title: 'Real estate arbitrage alerter',
    content: 'Monitor listings for price drops. Alert on undervalued properties. Auto-generate comp analysis.',
    category: 'finance',
    author_username: 'spark',
    author_user_id: 'system',
    score: 48,
    created_at: '2026-02-15T12:00:00Z'
  },
  {
    id: 'idea-15',
    title: 'Ambient music for deep work',
    content: 'Generative ambient audio with binaural beats. Adapts to your typing speed and breaks.',
    category: 'productivity',
    author_username: 'spark',
    author_user_id: 'system',
    score: 62,
    created_at: '2026-02-16T09:20:00Z'
  },
  {
    id: 'idea-16',
    title: 'Code review as a service (AI)',
    content: 'Drop a GitHub PR link. Get instant feedback on security, performance, style. Runs offline ONNX models.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 88,
    created_at: '2026-02-17T14:10:00Z'
  },
  {
    id: 'idea-17',
    title: 'Meal prep optimizer for macros',
    content: 'Input your macros. Get weekly meal plans. Auto-generate shopping lists. Minimize waste.',
    category: 'health',
    author_username: 'spark',
    author_user_id: 'system',
    score: 41,
    created_at: '2026-02-18T11:50:00Z'
  },
  {
    id: 'idea-18',
    title: 'API gateway for small teams',
    content: 'Open-source rate limiting, auth, logging. Deploy anywhere. Own your traffic.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 77,
    created_at: '2026-02-19T16:40:00Z'
  }
]

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
