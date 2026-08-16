// Resend transport. Set these env vars:
//   RESEND_API_KEY  — required, or sendMail no-ops
//   MAIL_FROM       — optional, defaults to noreply@sparkjar.heyitsmejosh.com
//   APP_URL         — optional, base for verify/reset links
//
// ponytail: plain fetch against the REST endpoint instead of the `resend` SDK.
// The SDK pulls in Node stream/http internals that don't run on workerd, and
// this is one POST — the dependency bought nothing. Same client shape is kept
// (`emails.send` returning `{ error }`) so _setClient stays a usable test seam.
let _client = null;

function restClient(apiKey) {
  return {
    emails: {
      async send(payload) {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(payload)
        });
        let data = null;
        try { data = await res.json(); } catch { data = null; }
        if (!res.ok) {
          return { error: { message: (data && (data.message || data.name)) || `resend_http_${res.status}` } };
        }
        return { data, error: null };
      }
    }
  };
}

function getClient() {
  if (_client) return _client;
  if (!process.env.RESEND_API_KEY) return null;
  _client = restClient(process.env.RESEND_API_KEY);
  return _client;
}

// Test seam: lets mail.selfcheck.js swap in a fake without network access.
function _setClient(client) {
  _client = client;
}

function from() {
  return process.env.MAIL_FROM || 'Spark <noreply@sparkjar.heyitsmejosh.com>';
}

// No-ops when Resend is unconfigured so a missing env var degrades to "no email"
// rather than a 500 on sign-up. A real send failure still throws — callers in
// register.js/password-reset.js catch it so the user-facing flow never breaks.
async function sendMail({ to, subject, text, html }) {
  const client = getClient();
  if (!client) {
    console.warn('[mail] RESEND_API_KEY not configured — skipping email send');
    return false;
  }
  const { error } = await client.emails.send({ from: from(), to, subject, text, html });
  if (error) throw new Error(error.message);
  return true;
}

function baseUrl() {
  return process.env.APP_URL || 'https://sparkjar.heyitsmejosh.com';
}

module.exports = { sendMail, baseUrl, from, _setClient };
