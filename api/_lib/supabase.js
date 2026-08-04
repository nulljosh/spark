function stripEnvPrefix(val) {
  // Handle env vars that arrive as KEY_NAME=value (Vercel quirk).
  // Only strip the prefix if the value starts with an uppercase identifier followed by '='.
  // This avoids mangling base64 keys that legitimately contain '=' padding.
  const m = val.match(/^[A-Z_]+=(.+)$/);
  return m ? m[1].trim() : val;
}

// Strip a *literal* trailing backslash-n / backslash-r (the two characters \ and n),
// not a real newline. Vercel env vars set via `echo` instead of `printf` end up
// carrying these, and String.trim() does not remove them because they are not
// whitespace. This silently broke production for weeks: SUPABASE_URL became
// "...supabase.co\n" (DNS failure) and SUPABASE_ANON_KEY became "<jwt>\n"
// (Invalid API key), so every Supabase call threw and the app fell back to seed
// data and in-memory auth -- which is what App Review saw as a broken app.
function stripLiteralEscapes(val) {
  return val.replace(/(?:\\[rn])+$/, '').trim();
}

function cleanEnv(val) {
  return stripLiteralEscapes(stripEnvPrefix((val || '').trim()));
}

function getSupabaseConfig() {
  let url = cleanEnv(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL);
  let anonKey = cleanEnv(process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  let serviceRoleKey = cleanEnv(process.env.SUPABASE_SERVICE_ROLE_KEY);

  return { url, anonKey, serviceRoleKey };
}

async function supabaseRequest(path, { method = 'GET', body, useServiceRole = false } = {}) {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  const key = (useServiceRole && serviceRoleKey) ? serviceRoleKey : anonKey;
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

async function supabaseRpc(fnName, params = {}, { useServiceRole = false } = {}) {
  const { url, anonKey, serviceRoleKey } = getSupabaseConfig();
  const key = (useServiceRole && serviceRoleKey) ? serviceRoleKey : anonKey;
  if (!url || !key) throw new Error('supabase_not_configured');

  const res = await fetch(`${url}/rest/v1/rpc/${fnName}`, {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    },
    body: JSON.stringify(params)
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
  cleanEnv,
  getSupabaseConfig,
  supabaseRequest,
  supabaseRpc
};
