// Temporary migration endpoint -- delete after running once
const { getSupabaseConfig } = require('./lib/supabase');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  const { url, key } = getSupabaseConfig();
  if (!url || !key) {
    return res.status(500).json({ error: 'Supabase not configured' });
  }

  // Use Supabase's pg-meta API to execute raw SQL
  // Service role key is required for DDL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  const sql = `
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_token TEXT;
    ALTER TABLE public.users ADD COLUMN IF NOT EXISTS reset_token_expires TIMESTAMPTZ;
  `;

  try {
    const pgRes = await fetch(`${url}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        apikey: serviceKey || key,
        Authorization: `Bearer ${serviceKey || key}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ query: sql })
    });

    // If exec_sql doesn't exist, try the pg endpoint
    if (!pgRes.ok) {
      // Fallback: try direct postgres query via Supabase SQL API
      const sqlRes = await fetch(`${url}/pg/query`, {
        method: 'POST',
        headers: {
          apikey: serviceKey || key,
          Authorization: `Bearer ${serviceKey || key}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: sql })
      });

      if (!sqlRes.ok) {
        const err = await sqlRes.text();
        return res.status(500).json({ error: 'Migration failed', details: err, hint: 'Run migrations/001_reset_tokens.sql in Supabase SQL Editor manually' });
      }

      return res.status(200).json({ message: 'Migration applied via pg endpoint' });
    }

    return res.status(200).json({ message: 'Migration applied via exec_sql' });
  } catch (err) {
    return res.status(500).json({ error: err.message, hint: 'Run migrations/001_reset_tokens.sql in Supabase SQL Editor manually' });
  }
};
