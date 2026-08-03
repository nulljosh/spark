// Redirect to GitHub OAuth authorization
module.exports = function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;
  if (!clientId) {
    return res.status(501).json({ error: 'GitHub OAuth not configured — add GITHUB_CLIENT_ID to Vercel env' });
  }
  const params = new URLSearchParams({
    client_id: clientId,
    scope: 'user:email',
    redirect_uri: `${process.env.SITE_URL || 'https://sparkjar.heyitsmejosh.com'}/api/auth/github-callback`,
  });
  res.writeHead(302, { Location: `https://github.com/login/oauth/authorize?${params}` });
  res.end();
};
