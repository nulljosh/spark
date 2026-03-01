function getSupabaseConfig() {
  let url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
  
  // Handle env vars that might be prefixed with key=value format (Vercel quirk)
  if (url.includes('=')) url = url.split('=').pop();
  if (key.includes('=')) key = key.split('=').pop();
  
  return { url: url.trim(), key: key.trim() };
}

async function supabaseRequest(path, { method = 'GET', body } = {}) {
  const { url, key } = getSupabaseConfig();
  if (!url || !key) throw new Error('supabase_not_configured');

  const res = await fetch(`${url}/rest/v1/${path}`, {
    method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: body ? JSON.stringify(body) : undefined
  });

  let data = null;
  try { data = await res.json(); } catch { data = null; }

  if (!res.ok) {
    const message = (data && (data.message || data.error || JSON.stringify(data))) || `supabase_http_${res.status}`;
    const err = new Error(message);
    err.status = res.status;
    throw err;
  }

  return data;
}

module.exports = {
  getSupabaseConfig,
  supabaseRequest
};
