// Two transports, tried in order:
//   1. Cloudflare Email Sending, via the `EMAIL` binding. No API key exists to
//      expire, which is why it is preferred -- RESEND_API_KEY died silently
//      once already and nobody noticed for months. Needs the domain onboarded
//      (`wrangler email sending enable heyitsmejosh.com`, an interactive step).
//   2. Resend, if RESEND_API_KEY is set.
// If neither is available sendMail returns false, and callers must treat that
// as a real failure rather than telling the user mail is on its way.
//
// Env vars:
//   RESEND_API_KEY  — optional fallback transport
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

// The Pages adapter stashes bindings here; process.env only carries strings.
function emailBinding() {
  return (globalThis.__env && globalThis.__env.EMAIL) || null;
}

function hasTransport() {
  return !!(emailBinding() || process.env.RESEND_API_KEY || _client);
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
  const email = emailBinding();
  if (email && !_client) {
    // from() carries a "Name <addr>" display form; the binding wants them split.
    const raw = from();
    const m = raw.match(/^(.*?)\s*<(.+)>$/);
    await email.send({
      to,
      from: m ? { name: m[1].trim(), email: m[2] } : { email: raw },
      subject,
      text,
      html
    });
    return true;
  }

  const client = getClient();
  if (!client) {
    console.warn('[mail] no transport configured (no EMAIL binding, no RESEND_API_KEY)');
    return false;
  }
  const { error } = await client.emails.send({ from: from(), to, subject, text, html });
  if (error) throw new Error(error.message);
  return true;
}

function baseUrl() {
  return process.env.APP_URL || 'https://sparkjar.heyitsmejosh.com';
}

module.exports = { sendMail, baseUrl, from, hasTransport, _setClient };
