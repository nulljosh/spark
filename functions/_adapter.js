// Vercel (req, res) handler -> Cloudflare Pages Function Response.
//
// ponytail: a 60-line shim instead of rewriting 2371 lines of handler code.
// Every api/*.js keeps its exact Node/Vercel signature; only the transport
// changes. The surface those handlers actually use is tiny (verified by
// grep before writing this): req.method/headers/query/body/url and
// res.status().json() / res.setHeader(). Nothing else needs emulating.

// Pages Functions get env from `context.env`, but the handlers all read
// `process.env.X`. nodejs_compat gives us a `process` object; we merge the
// bindings in on first request so both styles resolve to the same values.
function syncEnv(env) {
  if (typeof process === 'undefined' || !process.env) return;
  for (const [k, v] of Object.entries(env)) {
    if (typeof v === 'string') process.env[k] = v;
  }
}

function buildReq(request, rawBody, extraQuery) {
  const url = new URL(request.url);

  // Header keys from Headers are already lowercased, which satisfies both
  // access styles in the handlers: req.headers.authorization and
  // req.headers['stripe-signature'].
  const headers = Object.fromEntries(request.headers);

  const query = { ...Object.fromEntries(url.searchParams), ...extraQuery };

  let body;
  if (rawBody && rawBody.byteLength) {
    const text = new TextDecoder().decode(rawBody);
    const ct = headers['content-type'] || '';
    if (ct.includes('application/json')) {
      try { body = JSON.parse(text); } catch { body = undefined; }
    } else if (ct.includes('application/x-www-form-urlencoded')) {
      body = Object.fromEntries(new URLSearchParams(text));
    } else {
      body = text;
    }
  }

  const req = {
    method: request.method,
    headers,
    query,
    body,
    // auth.js regexes this to recover the action when there is no ?action=
    url: url.pathname + url.search
  };

  // stripe-webhook.js does `for await (const chunk of req)` to rebuild the
  // raw body for signature verification. Signing over the re-serialized JSON
  // would fail, so yield the original bytes untouched.
  req[Symbol.asyncIterator] = async function* () {
    if (rawBody && rawBody.byteLength) yield new Uint8Array(rawBody);
  };

  return req;
}

function buildRes() {
  const headers = new Headers();
  let statusCode = 200;
  let settled = false;
  let resolve;
  const done = new Promise((r) => {
    resolve = (response) => {
      if (settled) return;
      settled = true;
      r(response);
    };
  });

  const res = {
    get _settled() { return settled; },
    _fallback() {
      resolve(new Response(null, { status: statusCode, headers }));
    },
    setHeader(k, v) {
      // Set-Cookie is the one header that legitimately repeats; store.js's
      // setSessionCookie reads it back and passes an array to append.
      if (Array.isArray(v)) {
        headers.delete(k);
        for (const item of v) headers.append(k, item);
      } else {
        headers.set(k, v);
      }
      return res;
    },
    getHeader(k) {
      if (!headers.has(k)) return undefined;
      if (k.toLowerCase() === 'set-cookie') {
        const all = typeof headers.getSetCookie === 'function' ? headers.getSetCookie() : [headers.get(k)];
        return all.length > 1 ? all : all[0];
      }
      return headers.get(k);
    },
    status(code) { statusCode = code; return res; },
    json(payload) {
      headers.set('content-type', 'application/json');
      resolve(new Response(JSON.stringify(payload), { status: statusCode, headers }));
      return res;
    },
    send(payload) {
      resolve(new Response(payload, { status: statusCode, headers }));
      return res;
    },
    end(payload) {
      resolve(new Response(payload ?? null, { status: statusCode, headers }));
      return res;
    },
    redirect(code, location) {
      const to = typeof code === 'string' ? code : location;
      const st = typeof code === 'number' ? code : 302;
      headers.set('location', to);
      resolve(new Response(null, { status: st, headers }));
      return res;
    }
  };

  return { res, done };
}

export async function adapt(handler, context, extraQuery = {}) {
  const { request, env } = context;
  syncEnv(env);

  const rawBody = request.method === 'GET' || request.method === 'HEAD'
    ? null
    : await request.arrayBuffer();

  const req = buildReq(request, rawBody, extraQuery);
  const { res, done } = buildRes();

  try {
    // Some handlers resolve the response and keep working; others return
    // without ever touching res. Race so the first response wins, then fall
    // back to an empty body rather than hanging forever on an unsettled promise.
    await Promise.race([Promise.resolve(handler(req, res)), done]);
    if (!res._settled) res._fallback();
  } catch (err) {
    console.error('[adapter] handler threw:', err && err.stack ? err.stack : err);
    // If the handler already sent a response and only then threw, honour the
    // response it sent — don't mask a 200 with a 500.
    if (!res._settled) {
      return new Response(JSON.stringify({ error: 'Internal error' }), {
        status: 500,
        headers: { 'content-type': 'application/json' }
      });
    }
  }

  return done;
}

export default adapt;
