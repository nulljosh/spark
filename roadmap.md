# Sparkjar Roadmap

## Account deletion + avatar upload were 500ing — FIXED 2026-08-13 (`dfabe6e`)

Found while re-verifying the 2.1(a) rejection against production. The `users` table has
**two** id columns: `id` (bigint identity PK) and `user_id` (text, the `user-<ts>-<rand>`
value carried in the JWT). `delete-account.js` and `avatar.js` both filtered
`users?id=eq.${user.userId}` — a text value against the bigint column, which Postgres
rejects, so the request 500'd.

- **Account deletion was fully broken in production.** App Store Guideline 5.1.1(v)
  requires working in-app account deletion, so this was a live rejection risk independent
  of the 2.1(a) issue.
- **Avatar upload half-failed**: the blob was written to storage, then the PATCH threw, so
  the user got "Upload failed" *and* an orphaned blob, with no avatar set.
- `github-callback.js` is fine — it filters by a row's real `id` from a `select=*`.
- Regression test added in `tests/auth.test.mjs` (static scan of `api/`, fails if the bigint
  column is ever filtered by a text userId). Verified it fails on the bug, passes on the fix.
- Deployed manually with `vercel --prod` (git auto-deploy still isn't firing for this
  project — see the 2026-08-03 note). Verified live: register → delete → 200 `{ok:true}`,
  login afterwards → 401.

**Re-verified the 2.1(a) fix holds** (same session, against production): login 200,
register 201, `/api/posts` 200, stats/profile/notifications all 200. All Swift `baseURL`s
across ios/macos/watchos/widgets point at `sparkjar.heyitsmejosh.com`. Still not submitted —
freeze until 2026-08-18.

## App Review rejection reason — READ FROM RESOLUTION CENTER 2026-08-12

**Guideline 2.1(a) — Performance — App Completeness.** Reviewed 2026-08-03 on iPhone 17 Pro
Max **and iPad Air 11-inch (M3)**, iOS/iPadOS 26.6, version 1.0 (202607191845).

> Bug description: The user is unable to sign up or sign in to access the app.
> 1. Launch the app  2. Go to the sign in screen  3. Tap the **Sign in with Apple** option
> 4. **The app returns an error**  5. Go to the sign up page  6. Try to create an account
> 7. **The app returns an error**  8. Check other sections  9. **The app displays a server error**

Three separate failures: Sign in with Apple, email sign-up, and a server error elsewhere in
the app. Note the reviewer tested on iPad too. **FIXED 2026-08-12** — all three are one root cause:
the 2026-07-19 binary hardcoded `baseURL = "https://spark.heyitsmejosh.com"` (a host that no
longer resolves). Commit a458002 (2026-08-03) repointed to live sparkjar.heyitsmejosh.com, but
that landed after the review build snapshot. Production is healthy (verified 2026-08-12: auth
endpoints responding). Rebuilt iOS (202608121456) + macOS (202608121459), both VALID and awaiting
the 2026-08-18 freeze lift. Verified backend Sign in with Apple server-side (7/7 auth token checks
passed).  **Not the same root cause as healstack or lexly** — Sparkjar doesn't use Supabase Auth
(it has its own Vercel API); the others do.

Source: `asc web review show --app 6785162492 --apple-id trommatic@icloud.com` (needs `asc-login`;
the public API only returns a generic "unresolved issues" wrapper). Submissions frozen
until 2026-08-18 regardless — fix and stage, do not submit.

## ASC state verified 2026-08-10 — BOTH PLATFORMS ARE REJECTED, not "waiting for review"

`~/Documents/Code/CLAUDE.md` and older notes here say "iOS + Mac 1.0 WAITING_FOR_REVIEW
(2026-08-02 resubmitted)". **That is wrong.** Live state from `asc versions list --app 6785162492`:

| Platform | Version | State | Version id |
|---|---|---|---|
| IOS | 1.0 | `REJECTED` | `14770136-f866-42b4-850b-eef60edc51e7` |
| MAC_OS | 1.0 | `REJECTED` | `9a2a36d5-5358-425d-a659-015c3f3bc840` |

Both 08-02 resubmissions came back rejected. The open submissions are stuck in
`UNRESOLVED_ISSUES`: iOS `13b90678-12c4-47ae-b2a2-7df0cdcda784` (submitted 2026-08-02T18:04Z),
macOS `0dac7261-a62e-4865-b9ea-d20b36cc0cef` (2026-08-02T11:11Z).

**The phantom-IAP pattern is back — and it is not unique to sparkjar.** Each stuck submission
holds exactly one item, state `REJECTED`, reported by `asc review history` as type
`inAppPurchaseVersion`. But `asc iap list --app 6785162492` returns **zero IAPs**. The same
signature appears on healstack (also 0 IAPs). Decoding the item id is informative:
`base64 -d` on `MTNiOTA2NzgtMTJjNC00N2FlLWIyYTItN2RmMGNkY2RhNzg0fDZ8ODg3NTQzMDM5` gives
`13b90678-…|6|887543039` — a type code `6` plus a numeric resource id, so asc's
"inAppPurchaseVersion" label may just be a mislabelled type code rather than a real IAP.
Do not go hunting for an IAP to fix; there isn't one.

Worth noting: the bundle ID still has the `IN_APP_PURCHASE` capability enabled while the app
ships no IAPs. That is a plausible contributor and is cheap to turn off if the next
resubmission bounces the same way — but it is a hypothesis, not a confirmed cause.

## Email verification and password-reset flow — SMTP/Resend integration missing

The signup flow has optional email-verification (soft gate, existing accounts grandfathered, login never blocked) and password-reset flow implemented at `/api/auth/verify-email.js` and `/api/auth/password-reset.js`, but both silently no-op on Vercel production. Root cause: the `mail.js` utility checks for SMTP_HOST/SMTP_USER/SMTP_PASS/SMTP_FROM env vars, and none are set on Vercel. **Options:** (1) integrate Resend API (same provider Epiphany uses) by setting RESEND_API_KEY env var, adding sparkjar.heyitsmejosh.com as a Resend sending domain + DKIM/SPF records in Cloudflare, then replacing mail.js's SMTP code with Resend calls; (2) set up an SMTP relay on Vercel. Resend is simpler — costs $20/month at scale but free tier is enough for this app. Not fixed this session.

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
- [ ] Note for the next session: `SUPABASE_SERVICE_ROLE_KEY` could not be read back
      (Vercel marks it sensitive) so it was not re-added with `printf`. If service-role
      writes ever fail, suspect the same trailing `\n` — `cleanEnv()` should already
      neutralise it, but re-adding it cleanly is the certain fix.

## Blocked on Joshua

Two mechanical steps, both ~1 minute. **No Apple Developer portal work is required** — the
earlier note demanding a Services ID, a `.p8` key, `APPLE_TEAM_ID`, `APPLE_KEY_ID` and a
`APPLE_PRIVATE_KEY` was wrong and has been deleted. Native Sign in with Apple only needs
Apple's *public* JWKS to verify a token, and the `APPLE_ID_AUTH` capability was already
added headlessly to bundle ID `T8XK2M54GG` (`com.heyitsmejosh.spark`) on 2026-08-03.

  Both downloaded and their embedded entitlements verified:
  - iOS carries `application-identifier: QMM486NPYC.com.heyitsmejosh.spark`,
    `com.apple.developer.applesignin: ['Default']`, and `beta-reports-active` (TestFlight-eligible).
  - macOS carries `com.apple.application-identifier: QMM486NPYC.com.heyitsmejosh.spark`
    and `com.apple.developer.applesignin: ['Default']`.

  **Correction to the old instruction above:** the check "must show `application-identifier`"
  is iOS-only. macOS profiles use the prefixed key `com.apple.application-identifier` — a
  macOS profile will *never* show the bare `application-identifier`, so don't read its
  absence there as the ITMS-90886 failure. Check the prefixed key on Mac, the bare one on iOS.

  Note: the three old INVALID profiles were deliberately left in place (deleting them is riskier
  than leaving them; Xcode ignores invalid profiles). If manual signing picks one by name,
  delete "Spark iOS App Store" specifically — the new profile has a distinct name.

Future, not needed now: revoking Apple tokens on account deletion (Apple requires it for
apps offering account deletion, which `api/_lib/auth/delete-account.js` does) is the one
thing that would later need a `.p8` key and the client_secret JWT exchange. Not built.

## Fixed 2026-08-03 — dead hostname (partial fix for the 2.1(a) rejection)

Root cause of the reviewer's "sign up returns an error" and "app displays a server error": every native client hardcoded `https://spark.heyitsmejosh.com`, which is **dead** (curl returns 000/no response). `https://sparkjar.heyitsmejosh.com` returns 200. Repointed all 10 occurrences across `ios/`, `macos/`, `watchos/`, `widgets-ios/`, `widgets-macos/`, and the `api/_lib/auth/github*.js` SITE_URL fallbacks.

Endpoint verification against the new host: `/api/auth/login` 400 on empty body (alive, validating), `/api/auth/register` 400 (alive), `/api/posts` 200 GET / 401 POST (alive). `/api/auth/apple` 501 (the stub above).

Bundle-ID rename (`com.heyitsmejosh.spark` → `sparkjar`) deliberately NOT done here — still a separate coordinated change.

### Dead-hostname sweep results (2026-08-04) — all 7 findings FIXED 2026-08-04

Method note for whoever repeats this: `~/Documents/Code` is **itself a git repo**, so every child repo is gitignored and a plain `rg`/`grep -r` from that directory silently returns almost nothing (17 hits, all from the two top-level docs). `--no-ignore` is required — with it the same sweep returns 40 distinct hostnames. The original "not swept this pass" note likely hit exactly this.

All 40 `*.heyitsmejosh.com` hostnames curled. Dead (`000`, no DNS): `books`, `brief`, `charters`, `curvely`, `dose`, `lingo`, `monica`, `oldname`, `school`, `spark`, `tally`, `vxgd`, `yourapp`. Also `abraham` → 404, `uprighty` → 404, `life` → 403 (archived on purpose). Everything else 200.

**Correction to an existing note:** `voxprint.heyitsmejosh.com` now returns **200**, not `000`. The voxprint roadmap's "does not resolve, decide whether the domain follows the rename" item is out of date — the subdomain is live, so that decision may already be made. Re-check before acting on it.

Real bugs, ranked:

Not bugs, listed so they don't get re-flagged: `lexly/vercel.json:3` redirects *from* `lingo.` (a redirect source doesn't need to resolve — harmless, arguably should stay); `talli/src/api.js:340` lists both `talli.` and `tally.` in a CORS allowlist (extra entry, no effect); `journal/_site/**` hits are generated build output inside historical posts.

## From Apple Notes (imported 2026-08-08)
- [ ] **"TestFlight icon looks super old" — not a bug, expected staleness.** Checked via `asc builds list`: the latest uploaded iOS build (`8d32852e…`, version `202607191845`) was uploaded 2026-07-19T18:47. The app icon (`ios/Assets.xcassets/AppIcon.appiconset/AppIcon.png`) was last regenerated in commit `613a87b` on 2026-08-03 — 2 weeks *after* that build. No build has been uploaded since the icon fix, so TestFlight/ASC is correctly showing the icon that shipped in the last real upload — this is covered by the existing "Rebuild + resubmit BOTH platforms" item above, not a separate bug.
- [ ] Screenshots: only 1 of 4 iOS screenshots exist (`screenshots/ios/01-feed-6.7.png`) — no fastlane/Snapfile or asc-shots-pipeline wired up for this repo yet, needs setup from scratch.
- [ ] Landing page + registration/onboarding flow.

## Email transport is dead (found 2026-08-09)

- [ ] **Password reset has never worked.** `vercel env ls production` has no `SMTP_HOST`/`SMTP_USER`/`SMTP_PASS`, so `_lib/mail.js` `sendMail()` no-ops with a console.warn. `password-reset.js` still returns "If an account exists with that info, a reset link has been sent" — users are told a link went out and nothing is delivered. The same dead path now also swallows the new sign-up verification email.
- [ ] Fix = Resend, not SMTP. `RESEND_API_KEY` already exists on epiphany's Vercel env (see `epiphany/server/api/_email.js` for the working sender). Steps: add `sparkjar.heyitsmejosh.com` via `POST api.resend.com/domains`, create the returned DKIM/SPF/MX records in Cloudflare via API (`CLOUDFLARE_API_TOKEN` in `~/.config/fish/secrets.fish`), verify, then rewrite `api/_lib/mail.js` to Resend keeping the `sendMail({to,subject,text,html})` signature so register.js/password-reset.js stay untouched. Swap `nodemailer` for `resend` in package.json.
- [ ] Also set `APP_URL=https://sparkjar.heyitsmejosh.com` — verify/reset links are built from `baseUrl()`.
- Note: `epiphany.heyitsmejosh.com` is verified in Resend; root `heyitsmejosh.com` and `sparkjar.heyitsmejosh.com` are NOT.
- Full plan: `~/.claude/plans/tldr-shorter-and-bang-snazzy-cray.md`

## Rejection reason pulled 2026-08-10 (Resolution Center)
- [ ] **iOS 1.0 REJECTED — Guideline 2.1(a) Performance/App Completeness.** Reviewed 2026-08-03 on iPhone 17 Pro Max + iPad Air 11" (M3), iOS/iPadOS 26.6, build `202607191845` (uploaded 07-19). Submission `13b90678-12c4-47ae-b2a2-7df0cdcda784`. Apple's repro: launch → sign-in screen → tap **Sign in with Apple** → error; → sign-up page → create account → error; → other sections → **server error**. 3 screenshots downloaded to `.asc/web-review/6785162492/13b90678-.../`.
- [ ] **This is NOT an IAP problem.** `asc review history` labels the rejected item `inAppPurchaseVersion`, but the app has zero IAPs — the item ID decodes as `<uuid>|6|<num>`, so `6` is a mislabelled type code. Same trap previously mis-diagnosed on Lexly and Sparkjar Mac in July. Do not go hunting for an IAP.
- [ ] **Likely root cause is already documented above:** the broken mail sender (SMTP → Resend migration item). Registration and password-reset both send mail; a failing sender surfaces to a reviewer as exactly "create an account → error" plus a server error elsewhere. Fix the Resend migration + `APP_URL` first, then verify sign-up end-to-end on a clean device before rebuilding.
- [ ] Sign in with Apple erroring is a separate check — provisioning profiles were INVALID until 2026-08-10 (now `CY2V3B846P` iOS / `H9YQZ34MV5` macOS, both ACTIVE with `applesignin` entitlement verified). The reviewed build predates those, so it shipped without a valid SiWA entitlement. A rebuild on the new profiles may resolve this half on its own.
- [ ] Order of work: fix mail → verify signup + SiWA on a real device → rebuild BOTH platforms on the new profiles → resubmit. Do not resubmit the 07-19 build.

## ROOT CAUSE FOUND 2026-08-10 — supersedes the mail theory above
- [ ] **The rejection was a dead API host in the reviewed binary. No server bug, no mail bug.** Build `202607191845` (07-19) hardcoded `baseURL = "https://spark.heyitsmejosh.com"`, which no longer resolves (curl: could not resolve host). Commit `a458002` repointed every client to `sparkjar.heyitsmejosh.com` on **2026-08-03** — the same day Apple reviewed, too late for that binary. A dead host explains all three reported symptoms at once: Sign in with Apple errors, sign-up errors, and "other sections show a server error". They were all network failures.
- [ ] **Production is verified healthy as of 2026-08-10.** `POST /api/auth/register` against sparkjar.heyitsmejosh.com returns **201 with a session token**, both with and without an `email` field. `POST /api/auth/apple` with a bogus token returns a clean `401 Invalid Apple credentials` — i.e. `APPLE_CLIENT_ID` is configured and the verifier is reachable. The iOS client's payload contract (`ios/API/SparkAPI.swift:148`) matches `api/_lib/auth/register.js` exactly.
- [ ] **Correction — the SMTP/Resend item is NOT the rejection fix.** `mail.js` `getTransport()` returns null and `sendMail` returns `false` when SMTP env is absent; it degrades silently and never throws, and `register.js` deliberately does not fail signup on a send failure. It cannot produce the reviewer's error. Keep the Resend migration as real work (verification/reset mail genuinely never sends) but do not block the resubmission on it.
- [ ] **Remaining work is a rebuild, not a code change.** Archive both platforms off current `main` (dead host already gone) on the new profiles `CY2V3B846P` (iOS) / `H9YQZ34MV5` (macOS), then resubmit: `asc workflow run ship-ios VERSION:x.y.z` and `ship-mac`. Verify with `asc builds uploads list` — `asc builds upload` reports success on FAILED builds.

## Someday / Explore
- [ ] No web/Services-ID Sign in with Apple redirect exists — the browser app has no Apple path, native only. Not a rejection issue; note for feature parity.

## App Store submission freeze — until 2026-08-18
- [ ] **BLOCKED: no App Store submission on any app until 2026-08-18.** Account is under a Guideline 5.6 Developer Code of Conduct review suspension (Curvely, Transcriptly, Wiretext, NYC Survive). Apple warns that continued similar submissions may result in removal from the Apple Developer Program. Full detail: wiki `ship-plan.md` § "Guideline 5.6 suspension (2026-08-10)". TestFlight builds, pushes and web deploys are still fine.
- [ ] Sparkjar 1.0 REJECTED 2.1(a) (build 202607191845): Sign in with Apple returns an error, sign-up returns an error, and other sections show a server error. Production auth is broken end-to-end. Fix and verify against the live backend before any resubmit.

## Auth investigation 2026-08-10 — production API is HEALTHY
Tested the live API directly (the exact flows the reviewer reported failing):
- `POST /api/auth/register` → **201**, returns a valid JWT.
- `POST /api/auth/login` with `{username, password}` → **200**, valid JWT.
- `GET /api/posts` → **200**, full payload. No server error.
- `POST /api/auth/apple` with a bogus token → **401 "Invalid Apple credentials"**, NOT the 500 "misconfigured" branch — so `APPLE_CLIENT_ID` **is** set in production.
So the backend is not broken today, and Sign in with Apple is configured. The reviewed build was
**202607191845 (July 19)** and `asc builds list` confirms that is still the newest build — no
newer build has been uploaded since. So the failure is either client-side in that July 19 build
or was transient backend state on review day (Aug 3).
- [ ] Cut a fresh build and manually exercise sign-up, username sign-in, and Sign in with Apple on a real device before resubmitting. Do not resubmit the July 19 build.
- [ ] Note: login takes `username`, not email. Register accepts an optional email. Confirm the reviewer wasn't typing an email into the username field — if that's plausible, accept either.

## 2026-08-10 — build environment blockers found (will bite the Aug 18 rebuild)
Tried to prove the "just rebuild, no code change" claim by compiling current `main`. App sources
compile clean — across four build attempts **not one error came from app code**. Two local
toolchain problems block a clean build, though, and both need fixing before the Aug 18 rebuild:

1. **CoreSimulator is out of date** — "Current version (1051.54.0) is older than build version
   (1051.55.0)… Simulator device support disabled." With simulator support off, `XCTest` can't
   resolve, so the `SparkUITests` target fails (`UITests/PreviewScreenshot.swift:1:8: unable to
   resolve module dependency: 'XCTest'`). Fix: `sudo xcodebuild -runFirstLaunch` (needs sudo, so
   run it yourself: `! sudo xcodebuild -runFirstLaunch`).
2. **SwiftLint SPM checkout collides with its own build dir on a case-insensitive volume.**
   SwiftLint ships a Bazel `BUILD` file; macOS treats `BUILD` and `build` as the same name, so
   Xcode's attempt to create `build/` inside the checkout fails with "File exists but is not a
   directory". Workaround that works: pass an explicit `-derivedDataPath` (e.g.
   `-derivedDataPath /tmp/sparkdd`). Clearing DerivedData alone does NOT fix it — it recreates.
   Also pass `-skipPackagePluginValidation` or the SwiftLint plugin blocks the build on trust.

Note `SparkUITests` is scoped to the `test` action in `project.yml`, so the archive path used by
`asc workflow run ship-ios` should not hit blocker 1 — but verify rather than assume on Aug 18.
- [ ] Run `sudo xcodebuild -runFirstLaunch` to fix CoreSimulator.
- [ ] Then rebuild from main and confirm a clean archive before the Aug 18 resubmit.

## From Apple Notes (imported 2026-08-11)
- [ ] Web works, but iOS app still isn't on the App Store — confirm and communicate the current blocker (1.0 rejected 2026-08-03 Guideline 2.1(a); provisioning fixed 2026-08-10; Guideline 5.6 submission freeze until 2026-08-18)

## Sign-in rejection — ROOT CAUSE FOUND 2026-08-12

The demo account handed to reviewers is `appreview` / `appreview@heyitsmejosh.com`.
Queried the shared spark Supabase (`public.users`, sparkjar uses hand-rolled auth, not
`auth.users`): that row was **created 2026-08-04 04:42 UTC**. The review was
**2026-08-03** — *the demo account did not exist when the reviewer tried to sign in.*

That fully explains "the user is unable to sign up or sign in". The account exists now, so
this half is already fixed. Still to verify before resubmitting (freeze lifts 2026-08-18):

- [ ] Reviewer tested on **iPad Air 11-inch** too; Guideline 5.6 explicitly requires the app
      work on every device it's offered on. Test iPad, not just iPhone.

## Sign-in rejection — diagnosed, needs a build upload (confirmed 2026-08-12)

Two independent findings now agree: `efb4862` (2026-08-10) identified a **dead API host in
the reviewed build**, and this session confirmed the `appreview` demo account was created
2026-08-04, one day **after** the 2026-08-03 review. Both causes are addressed in main.

As with healstack, the fix exists only in the repo — it has to be built and uploaded.
Known build-env blockers to clear first, from `036cc3a`: stale CoreSimulator, and a SwiftLint
`BUILD`/`build` case collision.

- [ ] Clear the two build-env blockers, archive + upload, verify with
      `asc builds uploads list` (uploads report success even when they fail).
- [ ] Test on **iPad** — the reviewer used an iPad Air 11-inch.

## BUILDS UPLOADED 2026-08-12 — both platforms VALID, neither submitted

Everything below in this file about needing a rebuild is now DONE. Fresh binaries off current
`main` (dead host gone, demo account exists) are on both 1.0 records:

| Platform | Build | Build id | State | Attached |
|---|---|---|---|---|
| IOS | `202608121456` | `a4804d19-c597-4429-a4a9-86dc11990ea4` | VALID | yes |
| MAC_OS | `202608121459` | `2cccd363-28bb-44db-9f7d-8c7d8645ce47` | VALID | yes |

Verified with `asc builds list --app 6785162492`, not with the upload command's own exit code.
**Neither is submitted** — `SUBMIT:false` throughout, and the standalone publish/upload calls
omitted `--submit`. Freeze holds until 2026-08-18.

Four blockers were real and are fixed in `41ef562`:

1. **Version mismatch** — `ios/project.yml` had `MARKETING_VERSION 2.2.0` (the web app's
   version). ASC only has 1.0, so the build could not attach. Set to `1.0`; macOS `1.0.0` →
   `1.0` too, since ASC stores the literal string.
2. **iOS was pointed at an INVALID profile.** `PROVISIONING_PROFILE_SPECIFIER` said
   `Spark iOS App Store` (`7R5XHS8Y5M`, INVALID, no applesignin). Repointed to
   `Sparkjar iOS App Store 20260810` (`CY2V3B846P`, ACTIVE). Both it and the widgets profile
   had to be downloaded and installed locally — neither was on this machine.
3. **`ExportOptions.plist` used automatic signing**, so export re-derived
   `iOS Team Store Provisioning Profile` which lacks applesignin, and failed even after the
   archive signed correctly. Now `manual` with both profiles pinned.
4. **UITests were compiling into the app target.** `ios/project.yml`'s app target excluded
   `SparkTests` but not `UITests`, so `PreviewScreenshot.swift` built into `Spark` and the
   archive died on `unable to resolve module dependency: 'XCTest'`. The earlier note guessed
   the scheme's `SparkUITests: [test]` scoping protected the archive path — **it did not**,
   because the file was never in the UITests target as far as the app target was concerned.
   **This also means the stale-CoreSimulator item below is a red herring for archiving** —
   `sudo xcodebuild -runFirstLaunch` was never needed. Leave it for running actual tests.

The SwiftLint `BUILD`/`build` case collision is real and now handled in `.asc/workflow.json`
via `-derivedDataPath /tmp/sparkdd` on the iOS archive step.

macOS note: `asc xcode export` fails with "did not produce an .ipa file" because macOS exports
a `.pkg`. Export with `xcodebuild -exportArchive` directly, then
`asc builds upload --pkg`, then `asc versions attach-build --version-id <v> --build-id <b>`.
`ship-mac`'s `--ipa-path` will keep failing until the workflow learns about pkgs.

Also confirmed: the macOS app has **no** Sign in with Apple (no `ASAuthorization` anywhere in
`macos/`), so its missing `applesignin` entitlement is correct, not a bug. Don't "fix" it.

### Left before the 2026-08-18 submit

- [ ] **Sign in with Apple, on a real device.** Still open and NOT headless-checkable — it needs
      a human tapping the button against `/api/auth/apple`. This is the one item that genuinely
      requires Joshua.
- [ ] **iPad screenshots — this is a submission BLOCKER, not a nice-to-have.**
      `TARGETED_DEVICE_FAMILY = "1,2"`: Sparkjar is a **universal** app, which is exactly why the
      reviewer tested an iPad Air 11-inch. Apple requires iPad screenshots for any app offered on
      iPad, and there are currently **zero**. `ios/fastlane/Snapfile` lists only
      `iPhone 11 Pro Max` and `iPhone 14 Plus` — it needs an iPad device added. Available locally:
      `iPad Pro 13-inch (M5)`, `iPad Air 11-inch (M4)`, `iPad (A16)`.
      (Alternative, if iPad support is not actually wanted: set the family to `1` and the whole
      iPad requirement disappears. That is a product call for Joshua, not a cleanup.)
- [ ] **Screenshot pipeline is a from-scratch build — bigger than the old note claimed.**
      The previous line here said "no Snapfile wired up yet"; that was wrong in both directions.
      Actual state checked 2026-08-12:
      - `ios/fastlane/Snapfile` — **exists** (2 iPhone devices, `scheme("Spark")`,
        `output_directory ./fastlane/screenshots`)
      - `ios/fastlane/Fastfile` — **missing**
      - snapshot helper (`SnapshotHelper.swift`) — **missing**
      - `.env.accounts.local` — **missing**; use the `appreview` / `Reviewfb12f9a4!Aa`
        credentials already documented in this file instead of seeding a new account
      - `ios/UITests/PreviewScreenshot.swift` — exists, and is now correctly scoped to the
        `SparkUITests` target only (it used to leak into the app target and break the archive)
      Only 2 shots exist total: `screenshots/spark-feed.png`, `screenshots/ios/01-feed-6.7.png`.
      Next session: load the `appstore-screenshots` skill, create a dedicated `Sparkjar-Shots`
      simulator (concurrent sessions fight over the shared one), and mock **every** network path —
      a 401 mid-run silently screenshots the login screen and the test still passes green.
      Budget a real block of time; this is simulator-heavy.
- [ ] Then, and only after 2026-08-18, submit both platforms.

## Build+upload — RESOLVED 2026-08-12, see section above (found 2026-08-12)

healstack's equivalent upload succeeded today (build 202608121022, VALID, not submitted).
sparkjar did not get that far, for one reason:

**`ios/project.yml` says `MARKETING_VERSION "2.2.0"`, but ASC only has version 1.0** (iOS and
macOS, both REJECTED). 2.2.0 is the *web* app's version leaking into the iOS project. A 2.2.0
build cannot attach to the 1.0 record, so the upload would fail or mint an unwanted version.

Recommended: set `MARKETING_VERSION` to `1.0` to match the only record that exists (the iOS app
has never shipped, so aligning down is smaller than minting a new version), then:

    asc workflow run ship-ios VERSION:1.0 SUBMIT:false
    asc publish appstore --app 6785162492 --ipa .asc/artifacts/Spark.ipa --version 1.0 --wait

Note `.asc/workflow.json`'s publish step hardcodes `--submit` — `SUBMIT:false` skips it, and the
separate publish above omits it. Do NOT submit before 2026-08-18.

Known local blockers still to clear (from `036cc3a`): pass `-derivedDataPath /tmp/sparkdd` and
`-skipPackagePluginValidation` for the SwiftLint case-collision; CoreSimulator staleness needs
`! sudo xcodebuild -runFirstLaunch` from Joshua if the archive path hits it.

### From Notes (2026-08-14)
- [ ] **Landing page UI bump.** Functional but sparse — needs a product screenshot (or similar) to
  fill the dead space. Same pass as the inkpress landing page.
