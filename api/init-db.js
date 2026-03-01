const { supabaseRequest } = require('./lib/supabase');

// SQL to create tables (as separate statements since we can't batch)
const SQL_STATEMENTS = [
  `DROP TABLE IF EXISTS posts CASCADE`,
  `DROP TABLE IF EXISTS users CASCADE`,
  `CREATE TABLE users (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT UNIQUE NOT NULL,
    username TEXT UNIQUE NOT NULL,
    email TEXT,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE TABLE posts (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    category TEXT DEFAULT 'tech',
    author_username TEXT NOT NULL,
    author_user_id TEXT NOT NULL,
    score INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`,
  `CREATE INDEX idx_users_username ON users(username)`,
  `CREATE INDEX idx_posts_score ON posts(score DESC)`,
  `CREATE INDEX idx_posts_created ON posts(created_at DESC)`
];

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    // Try executing via raw SQL endpoint (pgrest doesn't support DDL)
    // Instead, we'll create tables via REST API by inserting, which will fail gracefully
    
    // Actually, use Supabase's pg-net or direct connection
    // For now, return success — schema should exist
    return res.status(200).json({ 
      message: 'Init endpoint ready. Schema should be created manually via Supabase SQL editor.',
      statements: SQL_STATEMENTS
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
