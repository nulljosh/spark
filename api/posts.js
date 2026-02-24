const { parseCookie, resolveSession } = require('./auth/store');

const fallbackPosts = [
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

function parseToken(authHeader, cookieHeader) {
  if (authHeader && authHeader.startsWith('Bearer ')) {
    try {
      const token = authHeader.slice(7);
      const decoded = Buffer.from(token, 'base64').toString('utf-8');
      const [username, userId] = decoded.split(':');
      if (!username || !userId) return null;
      return { username, userId };
    } catch {
      return null;
    }
  }

  const cookies = parseCookie(cookieHeader);
  const session = resolveSession(cookies.spark_session);
  if (!session) return null;
  return { username: session.username, userId: session.userId };
}

function getSupabaseConfig() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return { url, key };
}

async function supabaseRequest(path, { method = 'GET', body } = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('supabase_not_configured');

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = (data && (data.message || data.error || JSON.stringify(data))) || `supabase_http_${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

async function getPostsFromDataSource() {
  try {
    const rows = await supabaseRequest('posts?select=*&order=score.desc,created_at.desc');

    // Fallback trigger: table exists but empty
    if (!Array.isArray(rows) || rows.length === 0) {
      return { mode: 'demo', posts: [...fallbackPosts] };
    }

    const posts = rows.map((r) => ({
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
    }));

    return { mode: 'live', posts };
  } catch {
    // Fallback trigger: DB connection failure, bad keys, missing table, etc.
    return { mode: 'demo', posts: [...fallbackPosts] };
  }
}

async function addPostToDataSource({ title, content, category, user }) {
  const post = {
    id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
    title,
    content,
    category: category || 'tech',
    author: { username: user.username, userId: user.userId },
    score: 0,
    createdAt: new Date().toISOString()
  };

  try {
    await supabaseRequest('posts', {
      method: 'POST',
      body: {
        id: post.id,
        title: post.title,
        content: post.content,
        category: post.category,
        author_username: post.author.username,
        author_user_id: post.author.userId,
        score: post.score,
        created_at: post.createdAt
      }
    });
    return { mode: 'live', post };
  } catch {
    fallbackPosts.push(post);
    return { mode: 'demo', post };
  }
}

async function votePostInDataSource({ id, voteType }) {
  const delta = voteType === 'up' ? 1 : -1;

  try {
    const rows = await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}&select=*`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error('not_found');

    const newScore = (Number.isFinite(row.score) ? row.score : 0) + delta;
    await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { score: newScore }
    });

    return {
      mode: 'live',
      post: {
        id: row.id,
        title: row.title,
        content: row.content,
        category: row.category || 'tech',
        author: { username: row.author_username || 'spark', userId: row.author_user_id || 'system' },
        score: newScore,
        createdAt: row.created_at || new Date().toISOString()
      }
    };
  } catch {
    const local = fallbackPosts.find((p) => p.id === id);
    if (!local) return { mode: 'demo', post: null };
    local.score += delta;
    return { mode: 'demo', post: local };
  }
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const { mode, posts } = await getPostsFromDataSource();
    return res.status(200).json({ posts, mode });
  }

  if (req.method === 'POST') {
    const user = parseToken(req.headers.authorization, req.headers.cookie);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { title, content, category } = req.body || {};
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const { mode, post } = await addPostToDataSource({ title, content, category, user });
    return res.status(201).json({ post, mode });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.fallbackPosts = fallbackPosts;
module.exports.parseToken = parseToken;
module.exports.votePostInDataSource = votePostInDataSource;
