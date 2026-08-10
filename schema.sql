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
  verified boolean not null default false,
  verify_token text,
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
create index if not exists idx_users_verify_token on users(verify_token);
create index if not exists idx_posts_score on posts(score desc);
create index if not exists idx_posts_created on posts(created_at desc);

-- Seed data (6 demo posts, so feed isn't empty on first deploy)
insert into posts (id, title, content, category, author_username, author_user_id, score, created_at) values
  ('seed-1', 'Browser extension that shows any price in hours of your salary', 'You enter your hourly wage once. Then every price tag on Amazon, DoorDash, wherever gets a little label underneath: "4.2 hours of work." That $80 hoodie hits different when you see it costs a full day. My spending would drop overnight.', 'finance', 'spark', 'system', 247, '2026-01-10T09:20:00Z'),
  ('seed-2', 'Service that monitors government benefits and alerts you when you qualify', 'There are hundreds of federal and provincial programs most people never hear about. Disability credits, housing supplements, training grants. You fill out a profile once and it cross-references every program database, then pings you when something new opens up or your situation changes enough to qualify.', 'finance', 'spark', 'system', 189, '2026-01-16T14:00:00Z'),
  ('seed-3', 'An app that builds a grocery list from your prescriptions', 'Every medication has foods that help or hurt absorption. Magnesium with SSRIs, avoiding grapefruit with statins, iron-rich foods if you are on certain blood thinners. Scan your pill bottles and it generates a weekly grocery list optimized for your drug stack.', 'health', 'spark', 'system', 134, '2026-01-22T11:45:00Z'),
  ('seed-4', 'Neighborhood tool library -- lend and borrow stuff from people on your block', 'Most people own a power drill they use twice a year. A pressure washer that sits in the garage. A ladder. Simple app: list what you have, browse what neighbors have, request to borrow. No money, just reciprocity. Builds community and saves everyone from buying things they barely use.', 'sustainability', 'spark', 'system', 97, '2026-01-29T17:30:00Z'),
  ('seed-5', 'Auto-texter that messages your landlord when rent is late based on your bank balance', 'Connect your bank account. Set your rent amount and due date. If your balance dips below rent three days before it is due, it sends a pre-written message to your landlord explaining the situation and proposing a payment date. Takes the anxiety out of that conversation.', 'finance', 'spark', 'system', 68, '2026-02-04T08:15:00Z'),
  ('seed-6', 'Focus timer that blocks distracting sites but only during your actual productive hours', 'Every site blocker is all-or-nothing. This one learns when you actually get work done by tracking your typing and tab patterns for a week. Then it only blocks Reddit and Twitter during those high-focus windows. If you are in a slump anyway it lets you scroll guilt-free instead of fighting a battle you already lost.', 'productivity', 'spark', 'system', 42, '2026-02-11T20:00:00Z')
on conflict (id) do nothing;

-- Row Level Security
alter table users enable row level security;
alter table posts enable row level security;

-- Posts: anyone can read, only authenticated users can write, only authors can update/delete
create policy "anon_read_posts" on posts for select using (true);
create policy "authenticated_insert_posts" on posts for insert
  to authenticated
  with check (auth.uid()::text = author_user_id);
create policy "author_update_posts" on posts for update
  to authenticated
  using (auth.uid()::text = author_user_id);
create policy "author_delete_posts" on posts for delete
  to authenticated
  using (auth.uid()::text = author_user_id);

-- Users: anyone can read profiles, no direct writes (API handles auth)
create policy "anon_read_users" on users for select using (true);
create policy "no_direct_write_users" on users for insert with check (false);
create policy "no_direct_update_users" on users for update using (false);
create policy "no_direct_delete_users" on users for delete using (false);

-- Atomic score increment RPC (avoids read-modify-write race condition)
create or replace function increment_score(post_id text, delta integer)
returns integer
language sql
security definer
as $$
  update posts
  set score = score + delta
  where id = post_id
  returning score;
$$;
