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
  ('seed-1', 'Browser extension that saves recipes from any cooking video', 'You know when you''re watching a cooking video and the recipe is buried in a 20-minute vlog? This would just pull out the ingredients and steps automatically. Works on YouTube, TikTok, Instagram reels, whatever.', 'tech', 'spark', 'system', 142, '2026-01-15T08:00:00Z'),
  ('seed-2', 'App that texts you when your laundry is done based on your dryer timer', 'Set a timer when you start a load and it texts you when it''s done. Dead simple. I forget about my laundry literally every time and it sits there for hours getting musty.', 'tech', 'spark', 'system', 87, '2026-01-20T12:00:00Z'),
  ('seed-3', 'Tool that turns voice memos into organized notes', 'I ramble into my phone constantly with half-formed thoughts. Something that takes those voice memos and sorts them into actual categories with bullet points would save me so much time.', 'tech', 'spark', 'system', 61, '2026-02-01T09:30:00Z'),
  ('seed-4', 'Site that compares ingredient lists across different brands', 'Like a diff tool but for food labels. Pick two peanut butters and it highlights what''s different. Useful for people with allergies or anyone trying to avoid certain additives.', 'business', 'spark', 'system', 45, '2026-02-05T14:00:00Z'),
  ('seed-5', 'Chrome extension that dims everything except the video you''re watching', 'When I''m watching something in a browser tab, all the comments and sidebar recommendations are distracting. Just dim everything else to like 10% opacity so the video is the only bright thing on screen.', 'tech', 'spark', 'system', 38, '2026-02-10T11:00:00Z'),
  ('seed-6', 'Neighborhood tool library -- like a Little Free Library but for drills and stuff', 'Most people use a power drill maybe twice a year. A simple app where neighbors can list tools they''re willing to lend out. No money involved, just borrowing and returning. Build some community while you''re at it.', 'business', 'spark', 'system', 29, '2026-02-14T16:30:00Z')
on conflict (id) do nothing;

-- Row Level Security
alter table users enable row level security;
alter table posts enable row level security;

-- Posts: anyone can read, API handles auth for writes
create policy "anon_read_posts" on posts for select using (true);
create policy "api_insert_posts" on posts for insert with check (true);
create policy "api_update_posts" on posts for update using (true);
create policy "api_delete_posts" on posts for delete using (true);

-- Users: anyone can read profiles, no direct writes (API handles auth)
create policy "anon_read_users" on users for select using (true);
create policy "no_direct_write_users" on users for insert with check (false);
create policy "no_direct_update_users" on users for update using (false);
create policy "no_direct_delete_users" on users for delete using (false);
