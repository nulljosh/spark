// Resend transport. Set these env vars:
//   RESEND_API_KEY  — required, or sendMail no-ops
//   MAIL_FROM       — optional, defaults to noreply@sparkjar.heyitsmejosh.com
//   APP_URL         — optional, base for verify/reset links
let _resend = null;

async function getResend() {
  if (_resend) return _resend;
  if (!process.env.RESEND_API_KEY) return null;
  const { Resend } = await import('resend');
  _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

// Test seam: `await import('resend')` can't be stubbed from CJS, and the send
// path is the one worth testing. Used only by mail.selfcheck.js.
function _setClient(client) {
  _resend = client;
}

function from() {
  return process.env.MAIL_FROM || 'Spark <noreply@sparkjar.heyitsmejosh.com>';
}

// No-ops when Resend is unconfigured so a missing env var degrades to "no email"
// rather than a 500 on sign-up. A real send failure still throws — callers in
// register.js/password-reset.js catch it so the user-facing flow never breaks.
async function sendMail({ to, subject, text, html }) {
  const resend = await getResend();
  if (!resend) {
    console.warn('[mail] RESEND_API_KEY not configured — skipping email send');
    return false;
  }
  const { error } = await resend.emails.send({ from: from(), to, subject, text, html });
  if (error) throw new Error(error.message);
  return true;
}

function baseUrl() {
  return process.env.APP_URL || 'https://sparkjar.heyitsmejosh.com';
}

module.exports = { sendMail, baseUrl, from, _setClient };
