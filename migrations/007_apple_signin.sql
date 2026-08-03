-- Add Sign in with Apple support to users table.
-- Mirrors 006_github_oauth.sql; password columns were already made nullable there.
alter table users add column if not exists apple_id text unique;
create index if not exists idx_users_apple_id on users(apple_id) where apple_id is not null;
