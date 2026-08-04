## App Review demo account (reusable)

App Review requires demo credentials (macOS 2.1(a) "Information Needed").
Set on BOTH platforms' review details 2026-08-03. Reuse for every future submission.

- username: `appreview`
- password: `Reviewfb12f9a4!Aa`
- email: `appreview@heyitsmejosh.com`
- Real row in the shared `spark` Supabase project, seeded with 3 posts.
- Review detail IDs: macOS `b29b7268-f500-474b-959e-62621f736dd2`, iOS `4f4acf1d-c35f-4b2b-ac5e-52d635984444`.

## Rejection fixes 2026-08-03 (production was broken, not just the binary)

Sparkjar was REJECTED on both platforms. Investigating the "unable to sign up or
sign in" report turned up **four stacked production bugs**, none of which were the
originally-suspected cause:

1. **`useSupabase()` destructured a property that does not exist** (`api/_lib/store.js`).
   It read `const { url, key } = getSupabaseConfig()`, but that returns
   `{ url, anonKey, serviceRoleKey }`. `key` was always `undefined`, so `useSupabase()`
   always returned false and **every auth path skipped Supabase** for the `/tmp` store.
   On Vercel `/tmp` is per-instance and ephemeral, so accounts were created and then
   did not exist on the next request. This was THE root cause. Fixed in `4787840`.
2. **`SUPABASE_URL` and `SUPABASE_ANON_KEY` each carried a trailing literal `\n`**
   (two characters, from being set with `echo` rather than `printf`). `String.trim()`
   does not strip those, so the URL failed DNS and the key was rejected as invalid.
   Both re-added with `printf`; `cleanEnv()` in `api/_lib/supabase.js` now strips them
   defensively so a recurrence self-heals. Self-check: `node api/_lib/supabase.selfcheck.js`.
3. **Unapplied migration** — `posts` was missing the `date`/`time` columns that
   `LIST_COLUMNS` selects, so every feed read threw `column posts.date does not exist`
   and fell back to 12 hardcoded seed posts. Applied `20260613000008_add_date_time_fields`.
4. **Writes used the anon key against RLS that only admits `authenticated`.**
   `createUser` (plus `setResetToken`/`clearResetToken`/`updatePassword`), the posts
   INSERT and the comments INSERT all lacked `useServiceRole: true`. `createUser` also
   omitted `user_id`, which is NOT NULL with no default. The GitHub and Apple paths
   already did this correctly; the email/password path was the outlier.

Verified end-to-end against production after the fixes: register -> persists in
Postgres, login -> returns the correct `user-...` id, post -> row lands in `posts`.
Feed now serves 45 real rows instead of 12 seeds.

Also fixed: **1.5 Support URL** — ASC pointed at the site root (the marketing page),
and `/support` was the SPA served through the `vercel.json` catch-all. Added a real
static `support.html` (same pattern as `tos.html`, which bypasses the rewrite) and
repointed both platforms. **5.2.5** — the Mac app displayed as "SparkMac"; "Mac" in a
display name is an Apple trademark violation. Set `CFBundleDisplayName`/`PRODUCT_NAME`
to `Sparkjar` in `macos/project.yml`, leaving scheme/target/bundle ID alone.

### Still to do
- [ ] Rebuild + resubmit BOTH platforms. The reviewed builds (iOS `202607191845`,
      macOS build 3) predate the dead-host fix, so new binaries are required even
      though the server side is now correct.
- [ ] Note for the next session: `SUPABASE_SERVICE_ROLE_KEY` could not be read back
      (Vercel marks it sensitive) so it was not re-added with `printf`. If service-role
      writes ever fail, suspect the same trailing `\n` — `cleanEnv()` should already
      neutralise it, but re-adding it cleanly is the certain fix.
- [ ] Security follow-up, out of scope tonight: the `anon_read_users` RLS policy lets
      anyone holding the anon key read the whole `users` row, including `password_hash`
      and `reset_token`. Worth narrowing to the columns the client actually needs.

## Blocked on Joshua

Two mechanical steps, both ~1 minute. **No Apple Developer portal work is required** — the
earlier note demanding a Services ID, a `.p8` key, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and a
`APPLE_PRIVATE_KEY` was wrong and has been deleted. Native Sign in with Apple only needs
Apple's *public* JWKS to verify a token, and the `APPLE_ID_AUTH` capability was already
added headlessly to bundle ID `T8XK2M54GG` (`com.heyitsmejosh.spark`) on 2026-08-03.

- [ ] **Set one env var.** The `vercel` CLI is not installed on this machine — a side effect
  of the Vercel→Cloudflare migration, not a sign sparkjar has moved. Sparkjar is still one of
  the apps **on Vercel** pending a Workers rewrite, so this is still a Vercel env var today:
  ```
  npx vercel env add APPLE_CLIENT_ID production
  # value: com.heyitsmejosh.spark
  ```
  **Note this is throwaway work.** When sparkjar moves to Cloudflare Workers, this becomes a
  `wrangler secret put APPLE_CLIENT_ID`, and `api/_lib/auth/apple.js` (a Node serverless
  handler using `module.exports`/`req`/`res`) needs porting to a Workers fetch handler along
  with the rest of `api/`. The JWKS verification logic itself is portable — it's plain
  `fetch` + JWT verify, no Node-only APIs — but the handler signature is not. Fold the Apple
  endpoint into the Workers rewrite rather than doing this migration twice.
  This is the *audience* the server checks. Native Sign in with Apple sets the identity
  token's `aud` to the **app's bundle ID** — not a Services ID. (A future web flow would use
  a Services ID; `APPLE_CLIENT_ID` is comma-separated to allow both without a code change.)
  Without this var the endpoint returns a clear 500 and logs the missing name — it never
  fakes success.

- [x] **Apply the migration** `migrations/007_apple_signin.sql` — DONE 2026-08-03, applied to
  the shared `spark` Supabase project (`tjsxsqlxjmanwvmywwvw`) via MCP as migration
  `apple_signin`. `users.apple_id` + the partial index now exist. Additive only, no data
  touched.

- [ ] **Then rebuild and resubmit.** The capability change **invalidates the existing
  provisioning profile** — regenerate it (`asc profiles`) before archiving, and verify the
  built app with `codesign -d --entitlements :- <path>.app`: it must show both
  `com.apple.developer.applesignin` and `application-identifier`. A missing
  `application-identifier` is what made Uprighty's builds TestFlight-ineligible (ITMS-90886).

Future, not needed now: revoking Apple tokens on account deletion (Apple requires it for
apps offering account deletion, which `api/_lib/auth/delete-account.js` does) is the one
thing that would later need a `.p8` key and the client_secret JWT exchange. Not built.

## Fixed 2026-08-03 — dead hostname (partial fix for the 2.1(a) rejection)

Root cause of the reviewer's "sign up returns an error" and "app displays a server error": every native client hardcoded `https://spark.heyitsmejosh.com`, which is **dead** (curl returns 000/no response). `https://sparkjar.heyitsmejosh.com` returns 200. Repointed all 10 occurrences across `ios/`, `macos/`, `watchos/`, `widgets-ios/`, `widgets-macos/`, and the `api/_lib/auth/github*.js` SITE_URL fallbacks.

Endpoint verification against the new host: `/api/auth/login` 400 on empty body (alive, validating), `/api/auth/register` 400 (alive), `/api/posts` 200 GET / 401 POST (alive). `/api/auth/apple` 501 (the stub above).

Bundle-ID rename (`com.heyitsmejosh.spark` → `sparkjar`) deliberately NOT done here — still a separate coordinated change.

- [ ] **This dead-hostname class of bug may affect other renamed apps.** Any app whose domain moved during a rename could be shipping a binary pointed at a dead host, and it fails exactly like a backend outage. Flagged only — not swept this pass. Worth a `grep -rl` for old hostnames across `~/Documents/Code` against what actually resolves.


## From Icons.pdf / Asc.pdf (imported 2026-07-12)
- [ ] Sparkjar iOS: 4 screenshots + archive/upload — verified 2026-07-26: archive/upload done (build 202607191845 VALID on ASC 2026-07-19). Still only 1 of 4 screenshots exist (`screenshots/ios/01-feed-6.7.png`) — no fastlane/Snapfile or asc-shots-pipeline plan wired up for this repo yet, needs the pipeline set up from scratch (not a quick add), not attempted this pass.

## 2026-07-14 dump
- [ ] Landing page + registration/onboarding flow

## App Store submission (parked 2026-07-14, wrap-up)
- [ ] 4 screenshots (fastlane snapshot, iPhone 11 Pro Max / 14 Plus sims)
- [ ] archive + upload build (asc workflow run ship-ios)
- [ ] submit

## From Sparkjar.pdf (imported 2026-07-19)
- [x] Domain rename applied in code 2026-08-03 (commit a458002): all 10 `spark.heyitsmejosh.com` refs → `sparkjar.` across ios/macos/watchos/widgets + api SITE_URL fallbacks. Also fixed the fastlane `support_url.txt`/`privacy_url.txt`/`marketing_url.txt`, which still pointed at the dead host — ASC itself was already correct, but a `fastlane deliver` would have pushed the dead URL back onto the listing (Guideline 1.5 rejection). **Bundle-ID rename `com.heyitsmejosh.spark` → `sparkjar` still deliberately pending** — separate coordinated change.
