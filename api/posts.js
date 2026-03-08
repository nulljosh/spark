const { parseCookie, resolveSession, verifyToken } = require('./auth/store');
const { supabaseRequest } = require('./lib/supabase');

const seedPosts = [
  {
    id: 'seed-1',
    title: 'An app that tells you what bird is singing outside your window',
    content: 'You hold your phone up, it listens for a few seconds, and tells you the species. I hear the same bird every morning at 6am and I have no idea what it is. Shazam but for birds.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 203,
    created_at: '2026-01-12T07:15:00Z'
  },
  {
    id: 'seed-2',
    title: 'Tool that converts any recipe to work with whatever\'s already in your fridge',
    content: 'You snap a photo of your fridge or just type in what you have. It takes a recipe you want to make and swaps out ingredients you don\'t have for ones you do. No more buying cilantro for one dish and letting the rest rot.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 157,
    created_at: '2026-01-18T19:30:00Z'
  },
  {
    id: 'seed-3',
    title: 'A browser extension that replaces LinkedIn jargon with plain English',
    content: '"Synergize cross-functional deliverables" becomes "work with other teams." "Thought leader" becomes "person with opinions." I want to actually understand what people are saying on there without decoding corporate speak.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 94,
    created_at: '2026-01-25T11:00:00Z'
  },
  {
    id: 'seed-4',
    title: 'Widget that shows how much of your life you\'ve spent in meetings',
    content: 'Pulls from your calendar and gives you a running total. Hours, days, percentage of your waking life. Maybe a little graph that goes up over time. Depressing? Sure. Motivating to decline more meetings? Absolutely.',
    category: 'business',
    author_username: 'spark',
    author_user_id: 'system',
    score: 72,
    created_at: '2026-02-02T14:45:00Z'
  },
  {
    id: 'seed-5',
    title: 'Service that texts you when your favorite local restaurant has a short wait',
    content: 'There\'s this ramen place near me that always has a 45 minute wait. But sometimes on a random Tuesday it\'s empty. I just want a text that says "hey, only 2 people in line right now." Google has the busy-times data, someone just needs to make it push notifications.',
    category: 'business',
    author_username: 'spark',
    author_user_id: 'system',
    score: 48,
    created_at: '2026-02-08T18:20:00Z'
  },
  {
    id: 'seed-6',
    title: 'A site that shows you the actual night sky above your house right now',
    content: 'Not a star map app where you wave your phone around. Just a simple page that loads and shows what constellations and planets are visible from your exact location tonight, what time they rise and set, and whether cloud cover will ruin it. Weather app meets astronomy.',
    category: 'tech',
    author_username: 'spark',
    author_user_id: 'system',
    score: 31,
    created_at: '2026-02-15T21:00:00Z'
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
      console.error('[POSTS] Supabase fetch failed:', err.message);
      // Return seed data as fallback when Supabase is unreachable
      return res.status(200).json({ posts: seedPosts.map(rowToPost) });
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
module.exports.rowToPost = rowToPost;
module.exports.votePostInDataSource = votePostInDataSource;
