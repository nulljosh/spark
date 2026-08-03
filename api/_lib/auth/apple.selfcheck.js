// Self-check for Apple identity-token verification.
// Run: node api/_lib/auth/apple.selfcheck.js
//
// Generates a throwaway RSA keypair, serves it as a fake JWKS, and asserts the
// verifier accepts a good token and rejects each way a bad one can be bad.
// No network, no framework, no fixtures.

const assert = require('assert');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');

// store.js validates JWT_SECRET at import time; this check never issues a
// session token, it only exercises Apple token verification.
process.env.JWT_SECRET = process.env.JWT_SECRET || 'selfcheck-only-not-a-real-secret';

const { verifyIdentityToken, APPLE_ISSUER } = require('./apple');

const KID = 'selfcheck-key-1';
const AUDIENCE = 'com.heyitsmejosh.spark';
const SUB = '001234.abcdef.5678';

const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = { ...publicKey.export({ format: 'jwk' }), kid: KID, alg: 'RS256', use: 'sig' };
const jwks = [jwk];

const privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' });

function sign(payload, { key = privatePem, keyid = KID } = {}) {
  return jwt.sign(payload, key, { algorithm: 'RS256', keyid });
}

function basePayload(overrides = {}) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: APPLE_ISSUER,
    aud: AUDIENCE,
    sub: SUB,
    email: 'test@privaterelay.appleid.com',
    iat: now,
    exp: now + 600,
    ...overrides
  };
}

function expectReject(label, token, opts = {}) {
  let threw = false;
  try {
    verifyIdentityToken(token, { jwks, audience: [AUDIENCE], ...opts });
  } catch {
    threw = true;
  }
  assert.ok(threw, `expected rejection: ${label}`);
}

// 1. Valid token is accepted and yields the Apple user id.
const good = verifyIdentityToken(sign(basePayload()), { jwks, audience: [AUDIENCE] });
assert.strictEqual(good.sub, SUB, 'valid token should return sub');
assert.strictEqual(good.aud, AUDIENCE, 'valid token should return aud');

// 2. Wrong audience — a token minted for a different app must not sign you in.
expectReject('wrong aud', sign(basePayload({ aud: 'com.someone.else' })));

// 3. Expired token. clockTolerance is 30s, so push well past it.
expectReject(
  'expired',
  sign(basePayload({ iat: Math.floor(Date.now() / 1000) - 7200, exp: Math.floor(Date.now() / 1000) - 3600 }))
);

// 4. Wrong issuer.
expectReject('wrong iss', sign(basePayload({ iss: 'https://evil.example.com' })));

// 5. Bad signature — signed by a key that is not the one in the JWKS.
const { privateKey: otherKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
expectReject('bad signature', sign(basePayload(), { key: otherKey.export({ type: 'pkcs8', format: 'pem' }) }));

// 6. Unknown kid surfaces a distinguishable code so the handler can refresh
//    the JWKS once and retry (Apple rotates signing keys).
let unknownKidCode = null;
try {
  verifyIdentityToken(sign(basePayload(), { keyid: 'rotated-key' }), { jwks, audience: [AUDIENCE] });
} catch (err) {
  unknownKidCode = err.code;
}
assert.strictEqual(unknownKidCode, 'unknown_kid', 'rotated kid must be identifiable for retry');

// 7. Garbage input must not throw something unhandled.
expectReject('malformed', 'not-a-jwt');

console.log('apple.selfcheck: 7/7 passed');
