// Unified AI handler — enrich, idea-base, notes
// Routes by ?type= to stay under Vercel Hobby 12-function limit.
const { supabaseRequest } = require('./_lib/supabase');
const { parseToken } = require('./posts');
const { getIp, checkRateLimit } = require('./_lib/ratelimit');

// --- gemma ---

// Cloudflare Workers AI -- no API key to obtain, rotate, or silently expire.
// Model + /no_think + the response-read chain are all lifted from
// nimble/worker/worker.js, which is the known-good shape on this account.
const GEMMA_MODEL = '@cf/qwen/qwen3-30b-a3b-fp8';

async function callGemma(prompt, maxTokens = 1200) {
  const ai = globalThis.__env && globalThis.__env.AI;
  if (!ai) throw new Error('AI binding unavailable');
  // Without /no_think the model spends its whole budget on a reasoning trace and
  // returns empty content -- which is exactly how this failed the first time.
  const out = await ai.run(GEMMA_MODEL, {
    messages: [{ role: 'user', content: prompt + ' /no_think' }],
    temperature: 0.9,
    max_tokens: maxTokens
  });
  const msg = out && out.choices && out.choices[0] && out.choices[0].message;
  const raw = (out && out.response) || (msg && msg.content) || (msg && msg.reasoning) || '';
  // Workers AI sometimes hands back an already-parsed object rather than text.
  // Re-serialise it so callers keep their one contract: this returns a string.
  const text = typeof raw === 'string' ? raw : JSON.stringify(raw);
  return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Models wrap JSON in prose or fences however they feel that day. Strip fences,
// then fall back to the first {...} in the text -- same tolerance the old daemon
// needed for its arrays. Returns null rather than throwing.
function parseJsonish(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  try { return JSON.parse(clean); } catch { /* fall through */ }
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(clean.slice(start, end + 1)); } catch { return null; }
}

// --- generate (cron: post one AI idea) ---

const GEN_CATEGORIES = ['tech', 'productivity', 'finance', 'health', 'sustainability'];

async function handleGenerate(req, res) {
  // Vercel strips inbound x-vercel-* headers, so this only passes for real cron
  // invocations. Manual trigger: daemon secret as bearer.
  const auth = req.headers.authorization || '';
  const isCron = !!req.headers['x-vercel-cron'];
  const isDaemon = process.env.SPARK_DAEMON_SECRET && auth === 'Bearer ' + process.env.SPARK_DAEMON_SECRET;
  if (!isCron && !isDaemon) return res.status(401).json({ error: 'Unauthorized' });

  const category = GEN_CATEGORIES[Math.floor(Math.random() * GEN_CATEGORIES.length)];
  const recent = await supabaseRequest('posts?select=title&order=created_at.desc&limit=20');
  const recentTitles = (Array.isArray(recent) ? recent : []).map(r => '- ' + r.title).join('\n');

  const text = await callGemma(
    `You generate one startup/app idea for an idea-sharing board. Category: ${category}.\n` +
    `Style: concrete, everyday problem, plain language, no buzzwords. Like these existing posts (do NOT duplicate any):\n${recentTitles}\n\n` +
    `Reply with ONLY valid JSON, no markdown fences: {"title": "...", "content": "2-3 sentence description"}`
  );

  // 422, not 502: Cloudflare's edge swallows a 5xx body and serves its own
  // error page, which hid this failure entirely the first time it happened.
  const idea = parseJsonish(text);
  if (!idea) return res.status(422).json({ error: 'Model returned unparseable idea', raw: text.slice(0, 300) });
  if (!idea.title || !idea.content) return res.status(422).json({ error: 'Incomplete idea', raw: text.slice(0, 300) });

  const rows = await supabaseRequest('posts', {
    method: 'POST',
    body: {
      id: 'post-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8),
      title: String(idea.title).slice(0, 200),
      content: String(idea.content).slice(0, 2000),
      category,
      author_username: 'gemma',
      author_user_id: 'system',
      score: 0,
      created_at: new Date().toISOString()
    },
    useServiceRole: true
  });
  const row = Array.isArray(rows) ? rows[0] : rows;
  return res.status(201).json({ post: row });
}

// --- enrich ---

async function handleEnrich(req, res) {
  if (req.method === 'POST') {
    // Either a signed-in user, or the cron worker presenting the daemon secret
    // (same bearer check handleGenerate uses). The cron path skips the per-IP
    // limit: one scheduled call must not compete with real users' budget.
    const auth = req.headers.authorization || '';
    const isDaemon = !!process.env.SPARK_DAEMON_SECRET &&
      auth === 'Bearer ' + process.env.SPARK_DAEMON_SECRET;
    if (!isDaemon) {
      const user = parseToken(req.headers.authorization, req.headers.cookie);
      if (!user) return res.status(401).json({ error: 'Authentication required' });
      if (!checkRateLimit('enrich:' + getIp(req), 5, 60_000)) {
        return res.status(429).json({ error: 'Too many requests' });
      }
    }

    let { id, spec, plan } = req.body || {};
    if (!id) return res.status(400).json({ error: 'id required' });

    // No client-supplied spec/plan (daemon path) -> generate them with Gemma.
    if (!spec || !plan) {
      const rows = await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}&select=title,content,category`);
      if (!Array.isArray(rows) || !rows.length) return res.status(404).json({ error: 'Post not found' });
      const p = rows[0];
      const text = await callGemma(
        `Idea: "${p.title}" (${p.category})\n${p.content}\n\n` +
        `Write two short markdown sections to help build this idea.\n` +
        `Reply with ONLY valid JSON, no markdown fences: {"spec": "what to build, key features, ~150 words", "plan": "step-by-step build plan, ~150 words"}`,
        1200
      );
      const gen = parseJsonish(text);
      if (!gen) return res.status(422).json({ error: 'Model returned unparseable enrichment', raw: text.slice(0, 300) });
      spec = gen.spec;
      plan = gen.plan;
      if (!spec || !plan) return res.status(422).json({ error: 'Incomplete enrichment', raw: text.slice(0, 300) });
    }

    await supabaseRequest(`posts?id=eq.${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: {
        enriched: true,
        enrichment_plan: plan,
        enrichment_spec: spec,
        enrichment_completed_at: new Date().toISOString()
      },
      useServiceRole: true
    });

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// --- idea-base ---

async function handleIdeaBase(req, res) {
  if (req.method === 'GET') {
    const rows = await supabaseRequest('idea_bases?order=created_at.desc&limit=50');
    return res.status(200).json({ ideaBases: Array.isArray(rows) ? rows : [] });
  }

  if (req.method === 'POST') {
    const user = parseToken(req.headers.authorization, req.headers.cookie);
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    if (!checkRateLimit('ideabase:' + getIp(req), 2, 60_000)) {
      return res.status(429).json({ error: 'Too many requests' });
    }

    const { topic, description, post_ids } = req.body || {};
    if (!topic || typeof topic !== 'string' || topic.length > 200) {
      return res.status(400).json({ error: 'topic required (max 200 chars)' });
    }
    if (!Array.isArray(post_ids)) {
      return res.status(400).json({ error: 'post_ids array required' });
    }

    const rows = await supabaseRequest('idea_bases', {
      method: 'POST',
      body: {
        topic,
        description: description || null,
        post_ids,
        created_by: user.userId,
        created_at: new Date().toISOString()
      },
      useServiceRole: true
    });

    const row = Array.isArray(rows) ? rows[0] : rows;
    return res.status(201).json({ ideaBase: row });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}

// --- rfs (YC Requests for Startups, scraped + cached) ---

let rfsCache = { items: null, ts: 0 };
const RFS_TTL_MS = 12 * 60 * 60 * 1000;
const RFS_ENTRY_RE = /<div id="([\w-]+)"><div class="border[^"]*py-10[^"]*"><div class="w-full"><div class="mb-6"><h3[^>]*>([^<]+)<span.*?<\/h3><span[^>]*>By<!-- --> (.*?)<\/span><\/div>.*?whitespace-pre-wrap[^>]*>(.*?)<\/div><\/div><\/div><\/div><\/div><\/div>/gs;

function stripTags(s) {
  return s.replace(/<[^>]+>/g, '').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
}

async function fetchRfs() {
  const res = await fetch('https://www.ycombinator.com/rfs', { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) throw new Error(`YC fetch failed: ${res.status}`);
  const html = await res.text();
  const items = [];
  let m;
  while ((m = RFS_ENTRY_RE.exec(html))) {
    items.push({
      slug: m[1],
      title: stripTags(m[2]),
      author: stripTags(m[3]),
      description: stripTags(m[4]),
      url: `https://www.ycombinator.com/rfs#${m[1]}`
    });
  }
  return items;
}

async function handleRfs(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const fresh = rfsCache.items && (Date.now() - rfsCache.ts) < RFS_TTL_MS;
  if (!fresh) {
    try {
      const items = await fetchRfs();
      if (items.length) rfsCache = { items, ts: Date.now() };
    } catch (err) {
      console.error('[AI] rfs fetch failed', err.message);
      // ponytail: serve stale cache on fetch failure, only 500 if we have nothing
      if (!rfsCache.items) return res.status(502).json({ error: 'Could not fetch YC RFS' });
    }
  }

  return res.status(200).json({ rfs: rfsCache.items || [], cachedAt: rfsCache.ts });
}

// --- notes ---

async function handleNotes(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const id = req.query && req.query.id;
  if (!id) return res.status(400).json({ error: 'id required' });

  const rows = await supabaseRequest(
    `posts?id=eq.${encodeURIComponent(id)}&select=id,title,content,category,score,linked_repo,enrichment_plan,enrichment_spec,created_at`
  );

  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(404).json({ error: 'Post not found' });
  }

  const p = rows[0];
  const lines = [
    `---`,
    `id: ${p.id}`,
    `title: ${p.title}`,
    `category: ${p.category || 'tech'}`,
    `score: ${p.score || 0}`,
    p.linked_repo ? `repo: ${p.linked_repo}` : null,
    `created_at: ${p.created_at}`,
    `---`,
    ``,
    `# ${p.title}`,
    ``,
    p.content,
  ];

  if (p.enrichment_spec) lines.push('', '## Spec', '', p.enrichment_spec);
  if (p.enrichment_plan) lines.push('', '## Plan', '', p.enrichment_plan);

  const markdown = lines.filter(l => l !== null).join('\n');
  res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="spark-${p.id}.md"`);
  return res.status(200).send(markdown);
}

// --- router ---

module.exports = async function handler(req, res) {
  try {
    const type = req.query && req.query.type;
    if (type === 'enrich') return await handleEnrich(req, res);
    if (type === 'idea-base') return await handleIdeaBase(req, res);
    if (type === 'notes') return await handleNotes(req, res);
    if (type === 'rfs') return await handleRfs(req, res);
    if (type === 'generate') return await handleGenerate(req, res);
    return res.status(400).json({ error: 'type required: enrich | idea-base | notes | rfs | generate' });
  } catch (err) {
    console.error('[AI]', err.message);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
