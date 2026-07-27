
- Fn-cap headroom (2026-07-05): 10/12 used. When needed, merge api/posts/[id]/index.js + vote.js into api/posts.js dispatch (rewrite /api/posts/:id(/vote) in vercel.json) → frees 2 slots. Mechanical, ~30min. Deferred, no feature currently blocked.

## From Icons.pdf / Asc.pdf (imported 2026-07-12)
- [ ] Sparkjar iOS: 4 screenshots + archive/upload — verified 2026-07-26: archive/upload done (build 202607191845 VALID on ASC 2026-07-19). Still only 1 of 4 screenshots exist (`screenshots/ios/01-feed-6.7.png`) — no fastlane/Snapfile or asc-shots-pipeline plan wired up for this repo yet, needs the pipeline set up from scratch (not a quick add), not attempted this pass.
- [x] Spark Mac 1.0: build + metadata + submit — **already done**, roadmap was stale: verified 2026-07-26 via `asc versions list --app 6785162492 --platform MAC_OS` — version 1.0 is `WAITING_FOR_REVIEW` (submitted 2026-07-21), build attached.

## 2026-07-14 dump
- [ ] Hook up AI (Gemini preferred — check existing integration; Qwen fallback) for idea generation
- [ ] After AI works: infinite scroll + pagination on Ideas page
- [ ] Landing page + registration/onboarding flow
- [x] Fix broken Create view — root cause found + fixed 2026-07-26: `api/posts.js`'s POST handler destructured only `{title, content, category, linked_repo}` from the request body, silently dropping `date`/`time` that the "New Idea" modal (`app.html`) sends and `addPostToDataSource` already supports — those two fields never saved. Fixed by adding `date, time` to the destructure and the call. `npx vitest run tests` — 34 passed.
- [ ] Replace purple app icon with correct branding; bump version

## App Store submission (parked 2026-07-14, wrap-up)
- [ ] 4 screenshots (fastlane snapshot, iPhone 11 Pro Max / 14 Plus sims)
- [ ] archive + upload build (asc workflow run ship-ios)
- [ ] submit

## From Spark.pdf (imported 2026-07-14)
- [ ] Mac ASC: remove purple icon, replace with correct branding (same complaint as root roadmap purple-icon item, tracked here for Spark specifically) — reconfirmed still broken in TestFlight as of 2026-07-19 (dedup'd 2026-07-20, was tracked twice); needs visual on-device check, can't verify icon color from file bytes alone.

## From Sparkjar.pdf (imported 2026-07-19)
- [ ] Domain/bundle-ID rename not yet applied in code: `ios/`, `macos/`, `watchos/`, `widgets-*` all still hardcode `baseURL = "https://spark.heyitsmejosh.com"` and metadata's `supportUrl`/`marketingUrl` already say `sparkjar.heyitsmejosh.com` (mismatch). Verified 2026-07-20 — deliberately NOT changed here: bundle ID `com.heyitsmejosh.spark` → `sparkjar` rename is still pending per root roadmap, and this needs to land as one coordinated rename (code + bundle ID + DNS), not a partial edit.

## Stashed 2026-07-19
- [ ] **NEEDS JOSHUA'S DECISION** — iOS 1.0 still WAITING_FOR_REVIEW (confirmed 2026-07-26, since 06-27) while 2.2.0 builds (build 202607191845, VALID) sit unattached — decide: let 1.0 review land, or cancel and submit 2.2.0. Not auto-decided, not touched this pass.

## Ingested 2026-07-25
- [ ] Splash/landing page needs the cursive-font fix applied too (same issue flagged on echo — see echo/roadmap.md). Never use cursive.
