// Self-check for the Resend mail transport.
//
// The bug this guards against is the one that shipped for months: sendMail
// silently returning without sending, while register.js/password-reset.js told
// users a link was on its way. So: unconfigured must no-op (never throw, never
// break sign-up), configured must actually hand the message to Resend with the
// full {to,subject,text,html} payload, and a provider error must surface.
//
// Never touches the network — the client is injected via mail.js's test seam.
//
//   node api/_lib/mail.selfcheck.js

const assert = require('assert');

let sent = [];
let nextError = null;

const fakeClient = {
  emails: {
    send: async (payload) => {
      sent.push(payload);
      return nextError ? { error: { message: nextError } } : { data: { id: 'x' } };
    },
  },
};

function freshMail(env, { withClient = true } = {}) {
  delete require.cache[require.resolve('./mail')];
  for (const k of ['RESEND_API_KEY', 'MAIL_FROM', 'APP_URL']) delete process.env[k];
  Object.assign(process.env, env);
  const mail = require('./mail');
  if (withClient && env.RESEND_API_KEY) mail._setClient(fakeClient);
  return mail;
}

const MSG = { to: 'a@b.com', subject: 'Subj', text: 'plain', html: '<p>html</p>' };

(async () => {
  // 1. Unconfigured degrades to "no email" instead of throwing on sign-up.
  sent = [];
  const off = freshMail({});
  assert.strictEqual(await off.sendMail(MSG), false, 'no key should return false');
  assert.strictEqual(sent.length, 0, 'no key should not attempt a send');

  // 2. Configured actually sends, preserving every field the callers pass.
  sent = [];
  const on = freshMail({ RESEND_API_KEY: 're_test' });
  assert.strictEqual(await on.sendMail(MSG), true, 'configured should return true');
  assert.strictEqual(sent.length, 1, 'configured should send exactly once');
  assert.strictEqual(sent[0].to, MSG.to);
  assert.strictEqual(sent[0].subject, MSG.subject);
  assert.strictEqual(sent[0].text, MSG.text, 'text body must not be dropped');
  assert.strictEqual(sent[0].html, MSG.html, 'html body must not be dropped');
  assert.ok(/@sparkjar\.heyitsmejosh\.com>$/.test(sent[0].from), 'default From should be the sparkjar domain');

  // 3. A provider error surfaces rather than being reported as a success.
  nextError = 'domain not verified';
  await assert.rejects(() => on.sendMail(MSG), /domain not verified/, 'send errors must throw');
  nextError = null;

  // 4. Overrides are honoured — MAIL_FROM is the interim escape hatch while
  //    sparkjar.heyitsmejosh.com is still unverified in Resend.
  sent = [];
  const over = freshMail({ RESEND_API_KEY: 're_test', MAIL_FROM: 'Spark <noreply@epiphany.heyitsmejosh.com>' });
  await over.sendMail(MSG);
  assert.strictEqual(sent[0].from, 'Spark <noreply@epiphany.heyitsmejosh.com>');

  // 5. Link bases come from APP_URL, with the live host as the fallback.
  assert.strictEqual(freshMail({}).baseUrl(), 'https://sparkjar.heyitsmejosh.com');
  assert.strictEqual(freshMail({ APP_URL: 'https://x.test' }).baseUrl(), 'https://x.test');

  console.log('mail selfcheck: OK');
})().catch(err => { console.error(err); process.exit(1); });
