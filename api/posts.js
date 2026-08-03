const { parseCookie, resolveSession, verifyToken } = require('./_lib/store');
const { supabaseRequest, supabaseRpc } = require('./_lib/supabase');
const { getIp, checkRateLimit } = require('./_lib/ratelimit');

// Minimal seed data kept only as offline fallback when Supabase is unreachable.
// The canonical seed data lives in schema.sql. This array is never written to the DB.
const seedPosts = [
  { id: 'seed-1', title: 'A simple app that reminds you to use stuff you already own', content: 'I have books I bought and never read, a guitar collecting dust, a gym membership I forget about. Just a list of things you own with gentle nudges to actually use them.', category: 'productivity', author_username: 'spark', author_user_id: 'system', score: 247, created_at: '2026-01-10T09:20:00Z' },
  { id: 'seed-2', title: 'Shared grocery list for roommates that tracks who bought what', content: 'Splitwise but specifically for groceries. Add items to a shared list, check them off when you buy them, and it keeps a running tab so nobody feels ripped off.', category: 'finance', author_username: 'spark', author_user_id: 'system', score: 189, created_at: '2026-01-16T14:00:00Z' },
  { id: 'seed-3', title: 'A website that explains government forms in plain language', content: 'Tax forms, benefit applications, permits -- they are all written in legalese. Just show me the form with a plain English explanation next to each field.', category: 'finance', author_username: 'spark', author_user_id: 'system', score: 134, created_at: '2026-01-22T11:45:00Z' },
  { id: 'seed-4', title: 'Neighborhood tool library -- lend and borrow stuff from people on your block', content: 'Most people own a power drill they use twice a year. A simple board where neighbors can list stuff they are willing to lend out.', category: 'sustainability', author_username: 'spark', author_user_id: 'system', score: 97, created_at: '2026-01-29T17:30:00Z' },
  { id: 'seed-5', title: 'A recipe app that only shows recipes with ingredients you already have', content: 'You snap a photo of your fridge or type in what you have. It filters recipes down to ones you can actually make right now, no grocery run needed.', category: 'health', author_username: 'spark', author_user_id: 'system', score: 68, created_at: '2026-02-04T08:15:00Z' },
  { id: 'seed-6', title: 'A local events page that is not Facebook', content: 'Every community board is either on Facebook or some dead municipal website. Just a clean page showing what is happening nearby this week -- markets, open mics, free stuff.', category: 'productivity', author_username: 'spark', author_user_id: 'system', score: 42, created_at: '2026-02-11T20:00:00Z' },
  { id: 'seed-7', title: 'White noise machine that learns what sounds help you sleep', content: 'Start with rain, fan, ocean, whatever. It tracks when you fall asleep faster and gradually mixes in the sounds that actually work for you. No more scrolling through 200 ambient playlists.', category: 'health', author_username: 'kai', author_user_id: 'system', score: 156, created_at: '2026-02-18T21:30:00Z' },
  { id: 'seed-8', title: 'A parking app that shows where street cleaning is happening today', content: 'Every city has street cleaning schedules buried in PDFs. Just show me a map of which blocks are getting cleaned today so I know where not to park.', category: 'tech', author_username: 'dana', author_user_id: 'system', score: 112, created_at: '2026-02-25T10:00:00Z' },
  { id: 'seed-9', title: 'Browser extension that blocks sites during focus hours but with a 30-second delay', content: 'Not a hard block. When you try to open Twitter it shows a 30 second countdown with the question "do you actually need this right now?" Most of the time you close the tab.', category: 'productivity', author_username: 'sam', author_user_id: 'system', score: 88, created_at: '2026-03-04T15:45:00Z' },
  { id: 'seed-10', title: 'Plant watering tracker that accounts for weather', content: 'Most plant apps just say "water every 7 days" but if it rained all week your outdoor plants are fine. Pull local weather data and adjust the schedule automatically.', category: 'sustainability', author_username: 'reese', author_user_id: 'system', score: 73, created_at: '2026-03-11T08:30:00Z' },
  { id: 'seed-11', title: 'A tip calculator that splits by what each person actually ordered', content: 'Venmo and calculators split evenly but that never works. Take a photo of the receipt, tap which items are yours, and it tells each person their share with tax and tip included.', category: 'finance', author_username: 'jay', author_user_id: 'system', score: 201, created_at: '2026-03-18T19:15:00Z' },
  { id: 'seed-12', title: 'Walking directions that prioritize shade in summer', content: 'Google Maps finds the fastest route but in August I want the route with the most tree cover. Use satellite imagery to estimate shade coverage on each street.', category: 'tech', author_username: 'lex', author_user_id: 'system', score: 144, created_at: '2026-03-25T12:00:00Z' }
];

const LIST_COLUMNS = 'id,title,category,author_username,author_user_id,score,created_at,enriched,linked_repo,date,time,pinned_until';

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
    createdAt: r.created_at || new Date().toISOString(),
    enriched: r.enriched || false,
    linkedRepo: r.linked_repo || null,
    enrichmentPlan: r.enrichment_plan || null,
    enrichmentSpec: r.enrichment_spec || null,
    date: r.date || null,
    time: r.time || null,
    pinned: Boolean(r.pinned_until && new Date(r.pinned_until) > new Date())
  };
}

async function getPostsFromDataSource({ limit, offset } = {}) {
  // Only fetch columns needed for the feed list view (no content).
  // Pro posts pinned in the last 24h sort first, then the usual score/recency order.
  let query = `posts?select=${LIST_COLUMNS}&order=pinned_until.desc.nullslast,score.desc,created_at.desc`;
  if (Number.isFinite(limit)) query += `&limit=${limit}`;
  if (Number.isFinite(offset)) query += `&offset=${offset}`;
  const rows = await supabaseRequest(query);

  if (!Array.isArray(rows) || rows.length === 0) {
    // DB is empty -- schema.sql seeds should have run.
    // Trigger seed endpoint or return fallback. Don't maintain a second copy of seed inserts here.
    return { posts: offset ? [] : seedPosts.map(rowToPost) };
  }

  return { posts: rows.map(rowToPost) };
}

async function addPostToDataSource({ title, content, category, linked_repo, date, time, user, isPro }) {
  const post = {
    title,
    content,
    category: category || 'tech',
    author: { username: user.username, userId: user.userId },
    score: 0,
    createdAt: new Date().toISOString(),
    linkedRepo: linked_repo || null,
    date: date || null,
    time: time || null
  };

  const rows = await supabaseRequest('posts', {
    method: 'POST',
    body: {
      id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: post.title,
      content: post.content,
      category: post.category,
      linked_repo: post.linkedRepo,
      date: post.date,
      time: post.time,
      author_username: user.username,
      author_user_id: user.userId,
      score: 0,
      created_at: post.createdAt,
      pinned_until: isPro ? new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() : null
    }
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  post.id = row.id;
  return { post };
}

async function votePostInDataSource({ id, voteType, user }) {
  if (!user) throw new Error('Authentication required');

  const delta = voteType === 'up' ? 1 : -1;

  // Atomic increment via Supabase RPC -- no read-modify-write race condition
  const newScore = await supabaseRpc('increment_score', {
    post_id: id,
    delta
  }, { useServiceRole: true });

  if (newScore === null || newScore === undefined) {
    throw new Error('not_found');
  }

  return { post: { id, score: newScore } };
}

module.exports = async function handler(req, res) {
  const { id, vote } = req.query || {};

  if (id && vote && req.method === 'POST') {
    const user = parseToken(req.headers.authorization, req.headers.cookie);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const { voteType } = req.body || {};
    if (!voteType || !['up', 'down'].includes(voteType)) {
      return res.status(400).json({ error: 'voteType must be "up" or "down"' });
    }

    try {
      const { post } = await votePostInDataSource({ id, voteType, user });
      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }
      return res.status(200).json({ post });
    } catch (err) {
      if (err.message === 'not_found') return res.status(404).json({ error: 'Post not found' });
      console.error('[VOTE] Failed:', err.message);
      return res.status(500).json({ error: 'Failed to vote' });
    }
  }

  if (id && req.method === 'DELETE') {
    const user = parseToken(req.headers.authorization, req.headers.cookie);
    if (!user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    try {
      // Fetch the post to verify ownership
      const rows = await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}&select=*`);
      const post = Array.isArray(rows) ? rows[0] : null;

      if (!post) {
        return res.status(404).json({ error: 'Post not found' });
      }

      if (post.author_user_id !== user.userId) {
        return res.status(403).json({ error: 'You can only delete your own posts' });
      }

      // Ownership is enforced above in JS. Use the service role so the delete
      // isn't silently dropped by RLS (which keys off auth.uid(), absent here).
      // Requires SUPABASE_SERVICE_ROLE_KEY in env to actually remove the row.
      await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        useServiceRole: true
      });

      return res.status(200).json({ deleted: true });
    } catch (err) {
      console.error('[POSTS] Delete failed:', err.message);
      return res.status(500).json({ error: 'Failed to delete post' });
    }
  }

  if (req.method === 'GET') {
    try {
      const limit = Number.parseInt(req.query && req.query.limit, 10);
      const offset = Number.parseInt(req.query && req.query.offset, 10);
      const { posts } = await getPostsFromDataSource({
        limit: Number.isFinite(limit) ? limit : undefined,
        offset: Number.isFinite(offset) ? offset : undefined
      });
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

    let isPro = false;
    try {
      const rows = await supabaseRequest(`users?user_id=eq.${encodeURIComponent(user.userId)}&select=is_pro`);
      isPro = Boolean(rows && rows[0] && rows[0].is_pro);
    } catch (err) {
      console.error('[POSTS] Pro status lookup failed:', err.message);
    }

    if (!isPro && !checkRateLimit('post:' + getIp(req), 10, 60_000)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { title, content, category, linked_repo, date, time } = req.body || {};
    if (typeof title !== 'string' || title.length > 200) return res.status(400).json({ error: 'Title too long (max 200)' });
    if (typeof content !== 'string' || content.length > 5000) return res.status(400).json({ error: 'Content too long (max 5000)' });
    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }
    // linked_repo is rendered into an href; reject non-http(s) schemes so a
    // javascript:/data: URL can't ride through HTML-escaping into a clickable link.
    if (linked_repo != null && linked_repo !== '') {
      let okUrl = false;
      try { const u = new URL(String(linked_repo)); okUrl = u.protocol === 'http:' || u.protocol === 'https:'; } catch { okUrl = false; }
      if (!okUrl) return res.status(400).json({ error: 'linked_repo must be a valid http(s) URL' });
    }

    try {
      const { post } = await addPostToDataSource({ title, content, category, linked_repo, date, time, user, isPro });
      return res.status(201).json({ post });
    } catch (err) {
      console.error('[POSTS] Create failed:', err.message);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

module.exports.seedPosts = seedPosts;
module.exports.parseToken = parseToken;
module.exports.rowToPost = rowToPost;
module.exports.votePostInDataSource = votePostInDataSource;
