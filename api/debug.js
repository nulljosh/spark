module.exports = async function handler(req, res) {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  res.json({
    url_set: !!url,
    key_set: !!key,
    url_val: url ? url.slice(0, 30) + '...' : 'NOT SET',
    env_keys: Object.keys(process.env).filter(k => k.includes('SUPABASE'))
  });
};
