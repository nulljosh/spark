const Stripe = require('stripe');
const { supabaseRequest } = require('./_lib/supabase');

let stripe;
const getStripe = () => stripe || (stripe = new Stripe(process.env.STRIPE_SECRET_KEY));

const config = {
  api: { bodyParser: false },
};

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const buf = await buffer(req);
  const sig = req.headers['stripe-signature'];

  let event;
  try {
    event = getStripe().webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[WEBHOOK] Signature verification failed:', err.message);
    return res.status(400).json({ error: 'Webhook signature verification failed' });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.client_reference_id;
    if (userId) {
      try {
        await supabaseRequest(`users?user_id=eq.${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          body: { is_pro: true },
          useServiceRole: true,
        });
        console.log('[WEBHOOK] Pro unlocked:', userId);
      } catch (err) {
        console.error('[WEBHOOK] Failed to set is_pro:', err.message);
      }
    }
  }

  res.status(200).json({ received: true });
};

module.exports.config = config;
