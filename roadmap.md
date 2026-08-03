## Blocked on Joshua

- [ ] **Sign in with Apple is a stub returning HTTP 501 — this is the live cause of the 2.1(a) rejection.** `api/_lib/auth/apple.js` is a one-line handler that returns `501 {"error":"Apple Sign In not yet configured — add APPLE_CLIENT_ID and APPLE_TEAM_ID to Vercel env"}`. Meanwhile `ios/ContentView.swift:630` ships a real `SignInWithAppleButton` wired to it (`ios/Models/AppState.swift:78 handleAppleSignIn`), so tapping it always errors — exactly what App Review reported (submission `13b90678-12c4-47ae-b2a2-7df0cdcda784`, reviewed build 202607191845, iPhone 17 Pro Max / iPad Air M3, iOS 26.6). Needs from Joshua, in order:
  1. Create a Sign in with Apple **Services ID** + **key** in the Apple Developer portal for `com.heyitsmejosh.spark`, return URL `https://sparkjar.heyitsmejosh.com/api/auth/apple`.
  2. `vercel env add APPLE_CLIENT_ID` and `vercel env add APPLE_TEAM_ID` (plus the key id / private key the implementation ends up needing).
  3. Then the 501 stub has to be replaced with a real token-verification handler — that is a genuine multi-hour build, not a config flip (sparkjar's GitHub OAuth is hand-rolled, no Supabase Auth shortcut available here).
  **Alternative that avoids all of the above:** remove the Sign in with Apple button entirely, as was done for Litigate iOS 1.0.1 b4. Weigh against Guideline 4.8 — sparkjar still offers GitHub sign-in, so dropping Apple may itself draw a 4.8 flag. This is a product decision, not a code one.
- [ ] **DO NOT RESUBMIT sparkjar iOS until the above is resolved.** The dead-hostname half of the rejection is fixed (below), but the Sign in with Apple failure the reviewer explicitly listed as step 3-4 is untouched, so resubmitting now invites a second 2.1(a) rejection.

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
- [ ] Domain/bundle-ID rename not yet applied in code: `ios/`, `macos/`, `watchos/`, `widgets-*` all still hardcode `baseURL = "https://spark.heyitsmejosh.com"` and metadata's `supportUrl`/`marketingUrl` already say `sparkjar.heyitsmejosh.com` (mismatch). Verified 2026-07-20 — deliberately NOT changed here: bundle ID `com.heyitsmejosh.spark` → `sparkjar` rename is still pending per root roadmap, and this needs to land as one coordinated rename (code + bundle ID + DNS), not a partial edit.
