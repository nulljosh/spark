// Daily trigger for the Sparkjar idea feed.
//
// ponytail: no logic lives here. The generator and enricher are already in
// api/ai.js on the Pages project; this Worker exists solely because Cloudflare
// Pages cannot hold a cron trigger. Two authenticated fetches, nothing else.
const SITE = 'https://sparkjar.heyitsmejosh.com';

async function post(path, secret, body) {
  const res = await fetch(SITE + path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer ' + secret
    },
    body: JSON.stringify(body || {})
  });
  const text = await res.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* non-JSON error page */ }
  return { status: res.status, json, text };
}

async function run(env) {
  const secret = env.SPARK_DAEMON_SECRET;
  if (!secret) return console.error('[cron] SPARK_DAEMON_SECRET not set');

  const gen = await post('/api/ai?type=generate', secret);
  console.log(`[cron] generate -> ${gen.status}`);
  const id = gen.json && gen.json.post && gen.json.post.id;
  if (!id) return console.error(`[cron] no post id: ${gen.text.slice(0, 200)}`);

  const enr = await post('/api/ai?type=enrich', secret, { id });
  console.log(`[cron] enrich ${id} -> ${enr.status}`);
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(run(env));
  },
  // Manual trigger for verification; same secret gate as the API itself.
  async fetch(request, env) {
    const auth = request.headers.get('authorization') || '';
    if (!env.SPARK_DAEMON_SECRET || auth !== 'Bearer ' + env.SPARK_DAEMON_SECRET) {
      return new Response('Unauthorized', { status: 401 });
    }
    await run(env);
    return new Response('ok\n');
  }
};
