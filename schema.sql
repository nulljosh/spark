-- Spark: Supabase schema
-- Run this in the SQL Editor after creating the project

-- Users table
create table if not exists users (
  id bigint generated always as identity primary key,
  user_id text unique not null,
  username text unique not null,
  email text,
  password_salt text not null,
  password_hash text not null,
  created_at timestamptz default now()
);

-- Posts table
create table if not exists posts (
  id text primary key,
  title text not null,
  content text not null,
  category text default 'tech',
  author_username text not null,
  author_user_id text not null,
  score integer default 0,
  created_at timestamptz default now()
);

-- Indexes
create index if not exists idx_users_username on users(username);
create index if not exists idx_posts_score on posts(score desc);
create index if not exists idx_posts_created on posts(created_at desc);

-- Seed data (the 3 demo posts, so feed isn't empty on first deploy)
insert into posts (id, title, content, category, author_username, author_user_id, score, created_at) values
  ('seed-1', 'Open-source AI coding assistant', 'A local-first coding assistant that runs entirely on your machine. No API keys, no subscriptions, just Claude via Ollama.', 'tech', 'spark', 'system', 142, '2026-01-15T08:00:00Z'),
  ('seed-2', 'Micro-investment app for Gen Z', 'Round up every purchase to the nearest dollar and auto-invest the difference into a diversified ETF portfolio.', 'business', 'spark', 'system', 87, '2026-01-20T12:00:00Z'),
  ('seed-3', 'Sleep tracking without a wearable', 'Use your phone mic + accelerometer passively to track sleep cycles and give you a morning score. Zero hardware required.', 'tech', 'spark', 'system', 61, '2026-02-01T09:30:00Z')
on conflict (id) do nothing;
