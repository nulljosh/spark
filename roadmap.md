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
- [x] Security follow-up: the `anon_read_users` RLS policy let anyone holding the anon
      key read the whole `users` row, including `password_hash` and `reset_token`.
      **CLOSED 2026-08-04.** Confirmed live first (as `anon` I could read every user's
      bcrypt hash and email), then fixed in two ordered steps. RLS is row-level and
      cannot restrict columns, so the fix is column-level GRANTs, which Postgres ANDs
      with the row policy: migration `20260804000001_restrict_anon_user_columns` revokes
      blanket SELECT from `anon`/`authenticated` and re-grants only
      `id, user_id, username, created_at, avatar_url, is_pro` (the columns
      `api/users.js`, `api/user.js`, `api/posts.js` and `api/stripe.js` actually read).
      That required an app change first: `findUserByUsername`, `findUserByEmail` and
      `findUserByResetToken` in `store.js` were reading with the **anon** key and
      genuinely need `password_hash`/`reset_token`, so they now pass
      `useServiceRole: true`. Ordering was mandatory — applying the migration before the
      deploy would have 403'd those reads, which `findUserByUsername`'s bare `catch`
      swallows, silently falling back to the ephemeral `/tmp` store (the exact
      "accounts vanished" failure App Review hit twice). Deploy `2679926` was confirmed
      READY in production before the migration ran. Also hardened
      `supabaseRequest`/`supabaseRpc` to throw `supabase_service_role_key_missing`
      instead of silently downgrading a service-role call to the anon key, since that
      downgrade is what would re-trigger the same silent failure.
      Verified after: `select password_hash` as `anon` → `42501 permission denied`;
      register-collision → 409 (proves the service-role DB read works, not a `/tmp`
      fallback); login wrong-password → 401 not 500; `/api/users` and `/api/user` → 200
      with public fields intact. `get_advisors` reports no remaining `users` findings.

## Blocked on Joshua

Two mechanical steps, both ~1 minute. **No Apple Developer portal work is required** — the
earlier note demanding a Services ID, a `.p8` key, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and a
`APPLE_PRIVATE_KEY` was wrong and has been deleted. Native Sign in with Apple only needs
Apple's *public* JWKS to verify a token, and the `APPLE_ID_AUTH` capability was already
added headlessly to bundle ID `T8XK2M54GG` (`com.heyitsmejosh.spark`) on 2026-08-03.

- [x] **Set one env var — CONFIRMED 2026-08-06.** `APPLE_CLIENT_ID` already present in Vercel production env (set ~2026-08-03, value marked Sensitive/hidden by Vercel so content not re-verified, but the var exists and the endpoint depends on it existing, not on inspecting the value locally). Note below on the throwaway/Workers-migration nature still applies. The vercel CLI is not installed on this machine — a side effect
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

- [x] **This dead-hostname class of bug may affect other renamed apps.** Any app whose domain moved during a rename could be shipping a binary pointed at a dead host, and it fails exactly like a backend outage. Flagged only — not swept this pass. Worth a `grep -rl` for old hostnames across `~/Documents/Code` against what actually resolves. — **SWEPT 2026-08-04, see results below. It does affect other apps: 7 confirmed live bugs.**

### Dead-hostname sweep results (2026-08-04) — all 7 findings FIXED 2026-08-04

Method note for whoever repeats this: `~/Documents/Code` is **itself a git repo**, so every child repo is gitignored and a plain `rg`/`grep -r` from that directory silently returns almost nothing (17 hits, all from the two top-level docs). `--no-ignore` is required — with it the same sweep returns 40 distinct hostnames. The original "not swept this pass" note likely hit exactly this.

All 40 `*.heyitsmejosh.com` hostnames curled. Dead (`000`, no DNS): `books`, `brief`, `charters`, `curvely`, `dose`, `lingo`, `monica`, `oldname`, `school`, `spark`, `tally`, `vxgd`, `yourapp`. Also `abraham` → 404, `uprighty` → 404, `life` → 403 (archived on purpose). Everything else 200.

**Correction to an existing note:** `voxprint.heyitsmejosh.com` now returns **200**, not `000`. The voxprint roadmap's "does not resolve, decide whether the domain follows the rename" item is out of date — the subdomain is live, so that decision may already be made. Re-check before acting on it.

Real bugs, ranked:

- [x] **Talli watchOS + both widget extensions point at dead `tally.heyitsmejosh.com`.** — FIXED 2026-08-04: all three swapped to `talli.` (plus a stale `ios/README.md` ref). TalliWatch, TalliWidgetsExtension and TalliMac all build clean. Still needs a version bump + resubmit to actually reach users. The main app was migrated to `talli.` but these three were missed, so the watch app and the iOS/macOS widgets hit a host with no DNS — indistinguishable from a backend outage, which is very likely what's behind the long-standing unreproducible "navbar glitch"/"header avatar" complaints. Files: `talli/watchos/Models/WatchAPI.swift:6` (`private let baseURL`), `talli/widgets-ios/Models/WidgetAPI.swift:4` (`static let baseURL`), `talli/widgets-macos/Models/MacWidgetAPI.swift:4` (`static let baseURL`). Fix is a one-word host swap in each, but it ships in a binary so it needs a version bump + resubmit.
- [x] **Litigate's App Store `privacyPolicyUrl` points at a dead host.** — FIXED 2026-08-04: now `https://litigate.heyitsmejosh.com/privacy` (verified 200; `/privacy.html` 308-redirects there, so the canonical path was used). Metadata only — needs a `deliver`/asc metadata push to reach ASC. `litigate/metadata/app-info/en-US.json` → `https://brief.heyitsmejosh.com/privacy.html`, and `brief.` no longer resolves (that CNAME was deliberately deleted 2026-07-28). Apple requires a reachable privacy policy URL, and Litigate already has an open 5.1.1 privacy rejection on its roadmap — this is a plausible contributor and a near-certain rejection on the next submission. Should be `litigate.heyitsmejosh.com`.
- [x] **Epiphany's Talli integration points at dead `tally.heyitsmejosh.com`.** — FIXED 2026-08-04: both `TallyService.swift:33` swapped to `talli.`. iOS + macOS build clean. `epiphany/ios/Services/TallyService.swift:33` and `epiphany/macos/Services/TallyService.swift:33`, both `private static let baseURL`. Whatever Talli data Epiphany surfaces is silently dead on both platforms.
- [x] **Epiphany macOS "Open Web Upgrade" button opens a dead host.** — FIXED 2026-08-04: `monica.` → `epiphany.heyitsmejosh.com` (the live host, proven by both `EpiphanyAPI.swift` clients). The `/settings` path was DROPPED rather than guessed: the web app is a tab SPA (`activeTab === 'settings'` in `src/App.jsx:826`), so `/settings` is not a URL and 404s — it never existed as a path even before the rename. Button now opens the app root. Stale "redirected to Monica" alert copy fixed too. If a real settings deep link is ever added, point it there. `epiphany/macos/Views/SettingsView.swift:44` → `https://monica.heyitsmejosh.com/settings`. `monica.` does not resolve, so the button does nothing in the shipped Mac app. (`monica` appears to be a pre-rename Epiphany name — the keychain service on `TallyService.swift:34` is still `com.heyitsmejosh.monica.tally`.)
- [x] **Healstack still references its old `dose.` host in three places** — FIXED 2026-08-04: all three → `healstack.`. The two `sync.js` files were live `ALLOWED_ORIGIN` CORS values (not comments), and `stripe.js` already used `healstack.`, so the sync endpoint's CORS was rejecting the real origin. The iOS toggle label was also lying — `SyncService.swift:23` already hit `healstack.`. Dose scheme builds clean., one of them user-visible: `healstack/ios/Views/SettingsView.swift:77` renders a toggle literally labelled `"Sync with dose.heyitsmejosh.com"` — wrong brand *and* a dead host. Also `healstack/api/sync.js:4` and `healstack/functions/api/sync.js:1`; check whether those are live sync targets or just comments before touching.

Not bugs, listed so they don't get re-flagged: `lexly/vercel.json:3` redirects *from* `lingo.` (a redirect source doesn't need to resolve — harmless, arguably should stay); `talli/src/api.js:340` lists both `talli.` and `tally.` in a CORS allowlist (extra entry, no effect); `journal/_site/**` hits are generated build output inside historical posts.


## App Store submission checklist (consolidated 2026-08-06)
- [ ] Rebuild + resubmit BOTH platforms — reviewed builds (iOS `202607191845`, macOS build 3) predate the production-bug fixes above, new binaries required. See "Blocked on Joshua" above for the Sign in with Apple provisioning-profile regen this also needs.

## From Apple Notes (imported 2026-08-08)
- [ ] **"TestFlight icon looks super old" — not a bug, expected staleness.** Checked via `asc builds list`: the latest uploaded iOS build (`8d32852e…`, version `202607191845`) was uploaded 2026-07-19T18:47. The app icon (`ios/Assets.xcassets/AppIcon.appiconset/AppIcon.png`) was last regenerated in commit `613a87b` on 2026-08-03 — 2 weeks *after* that build. No build has been uploaded since the icon fix, so TestFlight/ASC is correctly showing the icon that shipped in the last real upload — this is covered by the existing "Rebuild + resubmit BOTH platforms" item above, not a separate bug.
- [ ] Screenshots: only 1 of 4 iOS screenshots exist (`screenshots/ios/01-feed-6.7.png`) — no fastlane/Snapfile or asc-shots-pipeline wired up for this repo yet, needs setup from scratch.
- [ ] Landing page + registration/onboarding flow.

## From Sparkjar.pdf (imported 2026-07-19)
- [x] Domain rename applied in code 2026-08-03 (commit a458002): all 10 `spark.heyitsmejosh.com` refs → `sparkjar.` across ios/macos/watchos/widgets + api SITE_URL fallbacks. Also fixed the fastlane `support_url.txt`/`privacy_url.txt`/`marketing_url.txt`, which still pointed at the dead host — ASC itself was already correct, but a `fastlane deliver` would have pushed the dead URL back onto the listing (Guideline 1.5 rejection). **Bundle-ID rename `com.heyitsmejosh.spark` → `sparkjar` still deliberately pending** — separate coordinated change.
