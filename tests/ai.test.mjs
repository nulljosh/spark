import { describe, it, expect, beforeEach } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const ai = require('../api/ai.js');

// Minimal (req, res) doubles matching the shape functions/_adapter.js builds.
function mkRes() {
  const state = { status: 0, body: null };
  const res = {
    status(code) { state.status = code; return res; },
    json(body) { state.body = body; return res; },
    send(body) { state.body = body; return res; },
    setHeader() { return res; }
  };
  return { res, state };
}

const mkReq = (auth, body) => ({
  method: 'POST',
  headers: auth ? { authorization: auth } : {},
  query: { type: 'enrich' },
  body: body || {}
});

describe('enrich auth: the cron worker gets in, nobody else does', () => {
  beforeEach(() => { process.env.SPARK_DAEMON_SECRET = 'test-secret'; });

  it('rejects an unauthenticated caller', async () => {
    const { res, state } = mkRes();
    await ai(mkReq(null, { id: 'post-1' }), res);
    expect(state.status).toBe(401);
  });

  it('rejects a wrong bearer', async () => {
    const { res, state } = mkRes();
    await ai(mkReq('Bearer wrong', { id: 'post-1' }), res);
    expect(state.status).toBe(401);
  });

  // The daemon bearer must clear the auth gate. It then fails later on the
  // missing id, which is exactly how we know it got past authentication.
  it('accepts the daemon bearer', async () => {
    const { res, state } = mkRes();
    await ai(mkReq('Bearer test-secret', {}), res);
    expect(state.status).toBe(400);
    expect(state.body.error).toMatch(/id required/);
  });

  it('does not accept any bearer when the secret is unset', async () => {
    delete process.env.SPARK_DAEMON_SECRET;
    const { res, state } = mkRes();
    await ai(mkReq('Bearer undefined', { id: 'post-1' }), res);
    expect(state.status).toBe(401);
  });
});
