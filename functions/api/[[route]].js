// Single Pages Function for the whole API surface.
//
// ponytail: one catch-all replaces 10 Vercel serverless functions *and* the
// /api/* rewrite rules from vercel.json. Pages has no 12-function cap, but one
// file is still less to keep in sync than ten near-identical wrappers.
//
// Route table below mirrors vercel.json's rewrites exactly:
//   /api/auth/:action        -> auth   (?action=:action)
//   /api/posts/:id/vote      -> posts  (?id=:id&vote=1)
//   /api/posts/:id           -> posts  (?id=:id)
//   /api/:name               -> :name
import { adapt } from '../_adapter.js';

import ai from '../../api/ai.js';
import auth from '../../api/auth.js';
import avatar from '../../api/avatar.js';
import comments from '../../api/comments.js';
import notifications from '../../api/notifications.js';
import posts from '../../api/posts.js';
import stripe from '../../api/stripe.js';
import stripeWebhook from '../../api/stripe-webhook.js';
import user from '../../api/user.js';
import users from '../../api/users.js';

const handlers = {
  ai,
  auth,
  avatar,
  comments,
  notifications,
  posts,
  stripe,
  'stripe-webhook': stripeWebhook,
  user,
  users
};

const ALLOWED_ORIGIN = 'https://sparkjar.heyitsmejosh.com';
const CORS = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Daemon-Secret'
};

function resolve(segments) {
  const [head, ...rest] = segments;

  if (head === 'auth' && rest.length) {
    return { handler: handlers.auth, query: { action: rest[0] } };
  }

  if (head === 'posts' && rest.length) {
    const query = { id: rest[0] };
    if (rest[1] === 'vote') query.vote = '1';
    return { handler: handlers.posts, query };
  }

  const handler = handlers[head];
  return handler ? { handler, query: {} } : null;
}

export async function onRequest(context) {
  const { request } = context;
  const url = new URL(request.url);

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS });
  }

  const segments = url.pathname.replace(/^\/api\/?/, '').split('/').filter(Boolean);
  const match = segments.length ? resolve(segments) : null;

  if (!match) {
    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { 'content-type': 'application/json', ...CORS }
    });
  }

  const response = await adapt(match.handler, context, match.query);

  // Vercel applied CORS via vercel.json headers; Pages has no equivalent, so
  // stamp them on here. Response headers are immutable, hence the clone.
  const headers = new Headers(response.headers);
  for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
  return new Response(response.body, { status: response.status, headers });
}
