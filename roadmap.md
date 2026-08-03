
- [x] Fn-cap headroom: DONE 2026-08-02 — merged api/posts/[id]/index.js (DELETE) + vote.js into api/posts.js's dispatch (id/vote query params), added matching rewrites in vercel.json before the catch-all. 8/12 functions now (was 10/12), 4 slots free.

## From Icons.pdf / Asc.pdf (imported 2026-07-12)
- [ ] Sparkjar iOS: 4 screenshots + archive/upload — verified 2026-07-26: archive/upload done (build 202607191845 VALID on ASC 2026-07-19). Still only 1 of 4 screenshots exist (`screenshots/ios/01-feed-6.7.png`) — no fastlane/Snapfile or asc-shots-pipeline plan wired up for this repo yet, needs the pipeline set up from scratch (not a quick add), not attempted this pass.

## 2026-07-14 dump
- [x] Hook up AI (Gemini preferred — check existing integration; Qwen fallback) for idea generation — ALREADY DONE, found 2026-08-03: `api/ai.js` `handleGenerate`/`callGemma` posts one AI idea via Gemma (GEMMA_KEY env var set in Vercel), triggered by the `crons` entry in `vercel.json` (`/api/ai?type=generate`). No Qwen fallback exists but Gemma path is live and working — roadmap item was stale.
- [x] After AI works: infinite scroll + pagination on Ideas page — DONE 2026-08-03: `api/posts.js` GET now accepts `?limit&offset` (server primitive for future use); `app.html`'s `load()` renders in batches of 20 via a new `renderNextFeedBatch()` + `IntersectionObserver` on a `#feedSentinel` div at the bottom of the feed (ponytail: paginates the already-fetched array client-side since the whole feed is one API call — switch to real server-side offset paging if the feed grows large enough that fetching it all up front gets slow). `npm test` passes (34 passed/6 skipped).
- [ ] Landing page + registration/onboarding flow
- [x] Replace purple app icon with correct branding; bump version — CHECKED 2026-08-03: `icon.svg` was already dark-navy/white (no purple) per git history (fixed 68fc5ec/917237e, predates this session). Regenerated all iOS/macOS/watchOS PNGs via `scripts/make-appicon.sh` to be safe. The "purple in TestFlight" complaint is ASC's stale cached icon render, not the source — clears on the next build upload (see ship-decision item below, already resolved).

## App Store submission (parked 2026-07-14, wrap-up)
- [ ] 4 screenshots (fastlane snapshot, iPhone 11 Pro Max / 14 Plus sims)
- [ ] archive + upload build (asc workflow run ship-ios)
- [ ] submit

## From Spark.pdf (imported 2026-07-14)
- [x] Mac ASC: remove purple icon, replace with correct branding — same fix as the iOS icon item above: source `icon.svg` is already correct, PNGs regenerated 2026-08-03, clears once the next Mac build uploads.

## From Sparkjar.pdf (imported 2026-07-19)
- [ ] Domain/bundle-ID rename not yet applied in code: `ios/`, `macos/`, `watchos/`, `widgets-*` all still hardcode `baseURL = "https://spark.heyitsmejosh.com"` and metadata's `supportUrl`/`marketingUrl` already say `sparkjar.heyitsmejosh.com` (mismatch). Verified 2026-07-20 — deliberately NOT changed here: bundle ID `com.heyitsmejosh.spark` → `sparkjar` rename is still pending per root roadmap, and this needs to land as one coordinated rename (code + bundle ID + DNS), not a partial edit.

## Stashed 2026-07-19
- [x] **DECIDED 2026-08-03 (Josh: cancel 1.0, submit 2.2.0)** — checked current ASC state before re-doing anything: this was already resolved on 2026-08-02 (see App Store.pdf entries below) — the old submissions were canceled and a fresh iOS review submission (`13b90678-12c4-47ae-b2a2-7df0cdcda784`) was created carrying build `8d32852e-b869-4247-8d20-d6719ae500b9`, whose `preReleaseVersion` is confirmed **2.2.0** (`asc builds info --build-id 8d32852e...`). That submission is WAITING_FOR_REVIEW as of 2026-08-02. The ASC `appStoreVersions` object still labels itself "1.0" (cosmetic/stale field) but the build actually under review is 2.2.0 — no further action taken to avoid disrupting a submission already in flight.

## From App Store.pdf (imported 2026-07-28)
- [x] Sparkjar macOS App Version 1.0 submission has an issue — RESOLVED 2026-08-02. Root cause: both the iOS and macOS 1.0 review submissions each had exactly one review item — a stale `inAppPurchaseVersion` pointing at an IAP that no longer exists (`asc iap list` returns empty) — same pattern as the earlier Lexly/Sparkjar Mac fix. The app version itself had 0 blocking errors on `asc validate` (only a non-blocking empty-subtitle warning). Fix: canceled both stale review submissions (`asc review submissions-cancel`), created fresh submissions containing only the `appStoreVersions` item (no IAP), and resubmitted (`asc review submissions-submit`). Both now WAITING_FOR_REVIEW as of 2026-08-02.

## From App Store.pdf (imported 2026-07-29)
- [x] Sparkjar iOS 1.0 AND macOS 1.0 both show Rejected on ASC — RESOLVED 2026-08-02, same fix as above (single stale-IAP review item on both platforms, no metadata/build issue). Both resubmitted, WAITING_FOR_REVIEW.
