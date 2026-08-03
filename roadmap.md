## Blocked on Joshua

Two mechanical steps, both ~1 minute. **No Apple Developer portal work is required** — the
earlier note demanding a Services ID, a `.p8` key, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and a
`APPLE_PRIVATE_KEY` was wrong and has been deleted. Native Sign in with Apple only needs
Apple's *public* JWKS to verify a token, and the `APPLE_ID_AUTH` capability was already
added headlessly to bundle ID `T8XK2M54GG` (`com.heyitsmejosh.spark`) on 2026-08-03.

- [ ] **Set one env var.** The `vercel` CLI is not installed on this machine, which is the
  only reason this is not already done. Either install it (`npm i -g vercel`) or run:
  ```
  npx vercel env add APPLE_CLIENT_ID production
  # value: com.heyitsmejosh.spark
  ```
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
