-- Close the anon-key credential leak on public.users.
--
-- Before this migration the `anon_read_users` RLS policy was `for select using (true)`
-- with no column restrictions, so anyone holding the anon key -- which ships inside the
-- web, iOS and macOS clients -- could read EVERY column of EVERY user row, including
-- bcrypt `password_hash`, `password_salt`, `reset_token`, `email`, and the OAuth
-- identifiers. That is an offline password-cracking corpus plus an account-takeover
-- path (a leaked reset_token is a password reset).
--
-- RLS is row-level and cannot restrict columns, so the fix is column-level GRANTs,
-- which Postgres ANDs with the RLS policy. The permissive row policy stays (public
-- profile data is genuinely public); the sensitive columns simply become invisible
-- to the anon role.
--
-- ORDERING REQUIREMENT: the API must already be reading users via the service role
-- before this lands. Commit `store.js` (findUserByUsername / findUserByEmail /
-- findUserByResetToken -> useServiceRole: true) must be DEPLOYED first, or logins
-- 403, get swallowed by findUserByUsername's catch, and silently fall back to the
-- ephemeral /tmp store -- which presents as "every account vanished".

-- Columns the anon role legitimately needs, from the API routes that run without
-- the service role:
--   api/users.js       -> id, username, created_at
--   api/user.js        -> id, username, created_at, avatar_url
--   api/posts.js       -> user_id, is_pro
--   api/stripe.js      -> user_id, is_pro
revoke select on public.users from anon;
grant select (id, user_id, username, created_at, avatar_url, is_pro)
  on public.users to anon;

-- `authenticated` is unused by this app (auth is custom JWT, not Supabase Auth), but
-- it inherits the same anon-key exposure surface, so lock it to the same columns.
revoke select on public.users from authenticated;
grant select (id, user_id, username, created_at, avatar_url, is_pro)
  on public.users to authenticated;

-- service_role keeps full access; it bypasses RLS and is server-only.
grant select on public.users to service_role;
