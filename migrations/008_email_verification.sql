-- Email verification for username/password sign-ups.
-- Soft verification: the flag is recorded but login is never blocked, so this
-- migration cannot lock anyone out. Existing accounts are grandfathered to true.
alter table users add column if not exists verified boolean not null default false;
alter table users add column if not exists verify_token text;

update users set verified = true where verified = false;

create index if not exists idx_users_verify_token on users(verify_token);
