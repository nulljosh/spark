
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
