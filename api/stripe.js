const Stripe = require('stripe');
const { supabaseRequest } = require('./_lib/supabase');
const { parseToken } = require('./posts');

let stripe;
function getStripe() {
  if (!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

const ALLOWED_ORIGIN = 'https://sparkjar.heyitsmejosh.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') return res.status(200).end();

  const { action } = req.query;
  const user = parseToken(req.headers.authorization, req.headers.cookie);

  if (req.method === 'GET' && action === 'status') {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const rows = await supabaseRequest(`users?user_id=eq.${encodeURIComponent(user.userId)}&select=is_pro`);
      return res.status(200).json({ isPro: Boolean(rows && rows[0] && rows[0].is_pro) });
    } catch (err) {
      console.error('[STRIPE/status] Error:', err.message);
      return res.status(500).json({ error: 'Failed to check pro status' });
    }
  }

  if (req.method === 'POST' && action === 'checkout') {
    if (!user) return res.status(401).json({ error: 'Authentication required' });
    try {
      const session = await getStripe().checkout.sessions.create({
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
        success_url: `${ALLOWED_ORIGIN}?pro=1`,
        cancel_url: ALLOWED_ORIGIN,
        client_reference_id: user.userId,
        customer_creation: 'always',
      });
      return res.status(200).json({ url: session.url });
    } catch (err) {
      console.error('[STRIPE/checkout] Error:', err.message);
      return res.status(500).json({ error: 'Checkout session creation failed' });
    }
  }

  return res.status(400).json({ error: 'Unknown action' });
};
