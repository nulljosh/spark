const { supabaseRequest } = require('../supabase');
const { createSession, issueToken, setSessionCookie } = require('../store');

const SITE_URL = process.env.SITE_URL || 'https://sparkjar.heyitsmejosh.com';

async function getGithubToken(code) {
  const res = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: process.env.GITHUB_CLIENT_ID,
      client_secret: process.env.GITHUB_CLIENT_SECRET,
      code,
    }),
  });
  const data = await res.json();
  return data.access_token || null;
}

async function getGithubUser(token) {
  const [userRes, emailRes] = await Promise.all([
    fetch('https://api.github.com/user', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Spark' } }),
    fetch('https://api.github.com/user/emails', { headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'Spark' } }),
  ]);
  const user = await userRes.json();
  const emails = await emailRes.json();
  const primary = Array.isArray(emails) ? (emails.find(e => e.primary && e.verified) || emails[0]) : null;
  return { id: String(user.id), login: user.login, email: primary?.email || user.email || null, avatar: user.avatar_url || null };
}

module.exports = async function handler(req, res) {
  const { code, error } = req.query;
  if (error || !code) {
    return res.writeHead(302, { Location: `${SITE_URL}/?auth_error=github_denied` }).end();
  }
  if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
    return res.status(501).json({ error: 'GitHub OAuth not configured' });
  }

  try {
    const accessToken = await getGithubToken(code);
    if (!accessToken) return res.writeHead(302, { Location: `${SITE_URL}/?auth_error=github_token` }).end();

    const gh = await getGithubUser(accessToken);

    // Find existing user by github_id
    let rows = await supabaseRequest(`users?github_id=eq.${encodeURIComponent(gh.id)}&select=*`, { useServiceRole: true }).catch(() => []);
    let user = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;

    if (!user && gh.email) {
      // Try linking to existing email account
      rows = await supabaseRequest(`users?email=eq.${encodeURIComponent(gh.email)}&select=*`, { useServiceRole: true }).catch(() => []);
      if (Array.isArray(rows) && rows.length > 0) {
        user = rows[0];
        await supabaseRequest(`users?id=eq.${user.id}`, {
          method: 'PATCH', useServiceRole: true,
          body: { github_id: gh.id, avatar_url: gh.avatar },
        }).catch(() => {});
      }
    }

    if (!user) {
      // Create new account; pick a unique username from GitHub login
      let username = gh.login.replace(/[^a-zA-Z0-9_]/g, '_').slice(0, 24);
      const existing = await supabaseRequest(`users?username=eq.${encodeURIComponent(username)}&select=id`, { useServiceRole: true }).catch(() => []);
      if (Array.isArray(existing) && existing.length > 0) username = `${username}_${gh.id.slice(-4)}`;

      const crypto = require('crypto');
      const userId = `gh-${crypto.randomBytes(8).toString('hex')}`;
      const newRows = await supabaseRequest('users', {
        method: 'POST', useServiceRole: true,
        body: {
          user_id: userId, username, email: gh.email || null,
          github_id: gh.id, avatar_url: gh.avatar,
          password_hash: null, password_salt: null,
          created_at: new Date().toISOString(),
        },
      });
      user = Array.isArray(newRows) ? newRows[0] : newRows;
    }

    if (!user) return res.writeHead(302, { Location: `${SITE_URL}/?auth_error=github_create` }).end();

    const mapped = { userId: user.user_id || user.id, username: user.username, email: user.email };
    const token = issueToken(mapped);
    const session = createSession({ user: mapped, token });
    setSessionCookie(res, session.id);

    // Pass JWT to frontend via query param so it can be stored in localStorage
    res.writeHead(302, { Location: `${SITE_URL}/?github_token=${encodeURIComponent(token)}` });
    res.end();
  } catch (err) {
    console.error('[GITHUB OAUTH]', err.message);
    res.writeHead(302, { Location: `${SITE_URL}/?auth_error=github_error` });
    res.end();
  }
};
