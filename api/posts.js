const { parseCookie, resolveSession, verifyToken } = require('./auth/store');

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
    const token = authHeader.slice(7);
    const user = verifyToken(token);
    if (user) return user;
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

// Supabase schema: posts.author_id -> users.id, posts has upvotes/downvotes/score
// Use PostgREST embedded resource to join author username
async function getPostsFromDataSource() {
  try {
    const rows = await supabaseRequest('posts?select=*,author:users!author_id(username)&order=score.desc,created_at.desc');

    if (!Array.isArray(rows) || rows.length === 0) {
      return { mode: 'demo', posts: [...fallbackPosts] };
    }

    const posts = rows.map((r) => ({
      id: r.id,
      title: r.title,
      content: r.content,
      category: r.category || 'tech',
      author: {
        username: (r.author && r.author.username) || 'spark',
        userId: r.author_id || 'system'
      },
      score: Number.isFinite(r.score) ? r.score : 0,
      upvotes: r.upvotes || 0,
      downvotes: r.downvotes || 0,
      createdAt: r.created_at || new Date().toISOString()
    }));

    return { mode: 'live', posts };
  } catch {
    return { mode: 'demo', posts: [...fallbackPosts] };
  }
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

  try {
    const rows = await supabaseRequest('posts', {
      method: 'POST',
      body: {
        title: post.title,
        content: post.content,
        category: post.category,
        author_id: user.userId,
        upvotes: 0,
        downvotes: 0,
        score: 0,
        status: 'active',
        views: 0,
        created_at: post.createdAt
      }
    });
    const row = Array.isArray(rows) ? rows[0] : rows;
    post.id = row.id;
    return { mode: 'live', post };
  } catch {
    post.id = 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
    fallbackPosts.push(post);
    return { mode: 'demo', post };
  }
}

// Vote using the votes table for per-user tracking
async function votePostInDataSource({ id, voteType, user }) {
  const delta = voteType === 'up' ? 1 : -1;

  try {
    // Fetch the post
    const rows = await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}&select=*,author:users!author_id(username)`);
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) throw new Error('not_found');

    let upvotes = row.upvotes || 0;
    let downvotes = row.downvotes || 0;

    if (user) {
      // Check for existing vote by this user
      const existingVotes = await supabaseRequest(
        `votes?user_id=eq.${encodeURIComponent(user.userId)}&post_id=eq.${encodeURIComponent(id)}&select=*`
      );
      const existingVote = Array.isArray(existingVotes) && existingVotes.length > 0 ? existingVotes[0] : null;

      if (existingVote) {
        if (existingVote.vote === voteType) {
          // Same vote again -- remove it (toggle off)
          await supabaseRequest(`votes?id=eq.${encodeURIComponent(existingVote.id)}`, { method: 'DELETE' });
          if (voteType === 'up') upvotes = Math.max(0, upvotes - 1);
          else downvotes = Math.max(0, downvotes - 1);
        } else {
          // Different vote -- update
          await supabaseRequest(`votes?id=eq.${encodeURIComponent(existingVote.id)}`, {
            method: 'PATCH',
            body: { vote: voteType }
          });
          if (voteType === 'up') { upvotes += 1; downvotes = Math.max(0, downvotes - 1); }
          else { downvotes += 1; upvotes = Math.max(0, upvotes - 1); }
        }
      } else {
        // New vote
        await supabaseRequest('votes', {
          method: 'POST',
          body: {
            user_id: user.userId,
            post_id: id,
            vote: voteType,
            created_at: new Date().toISOString()
          }
        });
        if (voteType === 'up') upvotes += 1;
        else downvotes += 1;
      }
    } else {
      // Anonymous vote (no user tracking)
      if (voteType === 'up') upvotes += 1;
      else downvotes += 1;
    }

    const newScore = upvotes - downvotes;
    await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: { upvotes, downvotes, score: newScore }
    });

    return {
      mode: 'live',
      post: {
        id: row.id,
        title: row.title,
        content: row.content,
        category: row.category || 'tech',
        author: {
          username: (row.author && row.author.username) || 'spark',
          userId: row.author_id || 'system'
        },
        score: newScore,
        upvotes,
        downvotes,
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
