// Self-check for the email-verification handler.
//
// Runs the real handler against an in-memory stand-in for the Supabase-backed
// store, so it exercises the branch logic that matters: a good token verifies,
// the same token cannot be reused, and an unknown/missing token fails closed.
//
//   node api/_lib/auth/verify-email.selfcheck.js

const assert = require('assert');
const path = require('path');

const storePath = require.resolve('../store');
const rows = new Map(); // token -> username
const verified = new Set();

require.cache[storePath] = {
  id: storePath,
  filename: storePath,
  loaded: true,
  exports: {
    async findUserByVerifyToken(token) {
      const username = rows.get(token);
      return username ? { username, verified: false } : null;
    },
    async markVerified(username) {
      verified.add(username);
      for (const [t, u] of rows) if (u === username) rows.delete(t);
      return true;
    },
  },
};

const handler = require('./verify-email');

function run(token) {
  const res = { status: 0, location: null, writeHead(s, h) { this.status = s; this.location = h.Location; }, end() {} };
  return handler({ query: token === undefined ? {} : { token } }, res).then(() => res);
}

(async () => {
  rows.set('good-token', 'alice');

  const first = await run('good-token');
  assert.strictEqual(first.status, 302);
  assert.ok(first.location.endsWith('/?verified=1'), 'valid token should verify');
  assert.ok(verified.has('alice'), 'user should be marked verified');

  const replay = await run('good-token');
  assert.ok(replay.location.endsWith('/?verified=0'), 'token must not be reusable');

  const unknown = await run('nope');
  assert.ok(unknown.location.endsWith('/?verified=0'), 'unknown token should fail');

  const missing = await run(undefined);
  assert.ok(missing.location.endsWith('/?verified=0'), 'missing token should fail');

  console.log('verify-email selfcheck: OK');
})().catch(err => { console.error(err); process.exit(1); });
