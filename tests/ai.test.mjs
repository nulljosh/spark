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

describe('password reset tells the truth when it cannot send', () => {
  process.env.SPARK_ALLOW_MEMORY_STORE = '1';
  const reset = require('../api/_lib/auth/password-reset.js');
  const mail = require('../api/_lib/mail.js');
  const store = require('../api/_lib/store.js');

  // A reset is only attempted for a user that exists and has an email, so the
  // failure paths below are unreachable without one.
  beforeEach(async () => {
    store._resetMemoryStore();
    await store.createUser({ username: 'someone', password: 'pw12345678', email: 'someone@example.com' });
  });

  const mkReq = () => ({
    method: 'POST',
    headers: {},
    query: { action: 'forgot' },
    body: { username: 'someone' }
  });

  it('503s rather than promising a link no transport can deliver', async () => {
    delete process.env.RESEND_API_KEY;
    delete globalThis.__env;
    mail._setClient(null);
    const { res, state } = mkRes();
    await reset(mkReq(), res);
    expect(state.status).toBe(503);
    expect(state.body.error).toMatch(/unavailable/i);
  });

  it('503s when a configured transport is actually broken', async () => {
    mail._setClient({ emails: { send: async () => ({ error: { message: 'invalid api key' } }) } });
    const { res, state } = mkRes();
    await reset(mkReq(), res);
    mail._setClient(null);
    expect(state.status).toBe(503);
  });

  it('keeps the account-existence-hiding generic reply when mail works', async () => {
    mail._setClient({ emails: { send: async () => ({ error: null }) } });
    const { res, state } = mkRes();
    await reset(mkReq(), res);
    mail._setClient(null);
    expect(state.status).toBe(200);
    expect(state.body.message).toMatch(/if an account exists/i);
  });
});
