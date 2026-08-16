// The adapter is the whole migration: every API route now reaches its handler
// through it, so a regression here breaks all of them at once. These cover the
// translation contract, not the handlers' business logic (already covered
// elsewhere).
import { describe, it, expect } from 'vitest';
import { adapt } from '../functions/_adapter.js';

const ctx = (request, env = {}) => ({ request, env });
const post = (body, headers = { 'content-type': 'application/json' }) =>
  new Request('https://x.test/api/thing', { method: 'POST', headers, body });

describe('vercel handler -> pages function adapter', () => {
  it('maps method, json body, query and lowercased headers onto req', async () => {
    let seen;
    const res = await adapt(
      async (req, r) => { seen = req; r.status(201).json({ ok: true }); },
      ctx(new Request('https://x.test/api/thing?a=1', {
        method: 'POST',
        headers: { 'content-type': 'application/json', Authorization: 'Bearer t' },
        body: JSON.stringify({ hello: 'world' })
      })),
      { id: 'from-route' }
    );

    expect(res.status).toBe(201);
    expect(await res.json()).toEqual({ ok: true });
    expect(seen.method).toBe('POST');
    expect(seen.body).toEqual({ hello: 'world' });
    expect(seen.headers.authorization).toBe('Bearer t');
    // route-derived params merge over the querystring
    expect(seen.query).toEqual({ a: '1', id: 'from-route' });
  });

  it('yields the raw unparsed body for stripe signature verification', async () => {
    // Signing over re-serialized JSON would produce a different byte sequence
    // and fail verification, so the original bytes must survive untouched.
    const raw = '{"b":2,  "a":1}';
    let collected = '';
    await adapt(async (req, r) => {
      for await (const chunk of req) collected += new TextDecoder().decode(chunk);
      r.status(200).json({});
    }, ctx(post(raw)));

    expect(collected).toBe(raw);
  });

  it('supports repeated Set-Cookie via getHeader/setHeader', async () => {
    // store.js setSessionCookie reads the existing value back and appends.
    const res = await adapt(async (req, r) => {
      r.setHeader('Set-Cookie', 'a=1');
      const existing = r.getHeader('Set-Cookie');
      r.setHeader('Set-Cookie', [existing, 'b=2']);
      r.status(200).json({});
    }, ctx(post('{}')));

    const cookies = res.headers.getSetCookie();
    expect(cookies).toContain('a=1');
    expect(cookies).toContain('b=2');
  });

  it('returns 500 when a handler throws before responding', async () => {
    const res = await adapt(async () => { throw new Error('boom'); }, ctx(post('{}')));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'Internal error' });
  });

  it('keeps the sent response when a handler throws after responding', async () => {
    const res = await adapt(async (req, r) => {
      r.status(200).json({ ok: true });
      throw new Error('late failure');
    }, ctx(post('{}')));

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });

  it('does not hang when a handler returns without responding', async () => {
    const res = await adapt(async () => {}, ctx(post('{}')));
    expect(res.status).toBe(200);
  });

  it('copies string bindings from context.env onto process.env', async () => {
    await adapt(async (req, r) => r.status(200).json({}), ctx(post('{}'), { ADAPTER_PROBE: 'v' }));
    expect(process.env.ADAPTER_PROBE).toBe('v');
  });
});
