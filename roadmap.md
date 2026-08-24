# Sparkjar Roadmap

## Done 2026-08-19 — macOS 1.0 resubmitted, 2.1(a) root cause found
The 2026-08-03 rejection (Guideline 2.1(a), submission `13b90678-12c4-47ae-b2a2-7df0cdcda784`)
was **a missing `APPLE_CLIENT_ID` on the Pages project**, not app code. Native Sign in with
Apple sets the token `aud` to the bundle ID, so `api/_lib/auth/apple.js` 500'd with
"Apple Sign In is misconfigured" — exactly what review hit. Fixed server-side in
`wrangler.toml` `[vars]`; **no rebuild, no version bump.**

Production verified before resubmitting: `/api/auth/login` 400, `/api/auth/apple` 401,
`/api/auth/register` 400 — clean rejections, no 500s. All 4 required Pages secrets set.

Cleared the stale `UNRESOLVED_ISSUES` submission with
`asc review items update --id <item> --resolved true`, which flipped the version to
`READY_FOR_REVIEW`; the **same** submission `0dac7261-a62e-4865-b9ea-d20b36cc0cef` then
accepted a direct submit. Creating a new submission was unnecessary. macOS 1.0 is
`WAITING_FOR_REVIEW`.

- [ ] **iOS 1.0 (`14770136-f866-42b4-850b-eef60edc51e7`) is still staged and NOT submitted.**
      Same server-side fix covers it. Submit once macOS gets a verdict. — STALE: iOS 1.0 + macOS 1.0.1 both WAITING_FOR_REVIEW as of 2026-08-24.
- [ ] Did not reply to the rejection thread — needs a fresh `asc web` 2FA code. Optional.

## Done 2026-08-18 — submit-ready
`asc validate` clean on iOS 1.0 (`14770136-f866-42b4-850b-eef60edc51e7`) and macOS 1.0
(`9a2a36d5-5358-425d-a659-015c3f3bc840`): 0 errors, 0 warnings, 0 blocking.

Fixed today: the app-info subtitle was empty (the only warning on both rows). Set to
"Share ideas, vote the best up" on `ab98bc13-46ae-4169-bc11-2de1b46a697b` (en-US).

Still open and unrelated to submission: Stripe / OAuth / email remain unconfigured.

## Staged for submission 2026-08-18 — builds uploaded, NOT submitted

Both platforms now carry a build newer than the 2026-08-18 auth fixes and validate clean:
`asc validate` returns **0 errors / 0 blocking** on iOS and macOS (1 warning, 1 info each).
App Privacy is published. Nothing is queued for review.

- [ ] **App Privacy is declared `DATA_NOT_COLLECTED`, which looks wrong for this app.**
      Verified published 2026-08-18 via `asc web privacy pull --app 6785162492`. But Sparkjar
      has accounts, stores email addresses, user posts and avatars — that is collected data
      linked to the user. A misdeclaration is its own rejection risk (and Apple has already
      rejected this app once). Expected shape is closer to: email + user content, linked to
      user, not used for tracking. Decide the correct declaration, then re-apply with
      `asc web privacy plan/apply/publish` (apply BEFORE publish, or publish 409s).
- [ ] Subtitle is empty for en-US on both platforms (`metadata.required.subtitle`,
      non-blocking warning). Needs real copy, not a placeholder.

## Two live auth breaks found + fixed 2026-08-18 (`/work start`)

Probed production directly (post-Cloudflare-Pages migration) instead of trusting the notes
below. Two defects were live on `sparkjar.heyitsmejosh.com` and both would have caused an
immediate repeat of the 2.1(a) rejection:

1. **`POST /api/auth/apple` returned 500 `"Apple Sign In is misconfigured"`.**
   `APPLE_CLIENT_ID` was never set on Cloudflare Pages — the migration notes in
   `wrangler.toml` listed it as *optional*, which it is not while the apps ship a Sign in
   with Apple button. This is exactly Apple's step 3-4 ("Tap Sign in with Apple -> the app
   returns an error"). The value is a bundle ID, not a secret, so it now lives in
   `[vars]` in `wrangler.toml` where it survives redeploys: `com.heyitsmejosh.spark`
   (iOS and macOS share it). **The "verified backend Sign in with Apple (7/7)" claim below
   was a *local* selfcheck — it never touched production. Don't trust it again.**

2. **Password reset was a permanent 400 in production.** `functions/api/[[route]].js`
   injected `{ action: '<route>' }` into `req.query`, and `_adapter.js` merges that *over*
   the real search params — so `/api/auth/password-reset?action=forgot` arrived at
   `password-reset.js` with `action === 'password-reset'` and always fell through to
   `"Unknown action"`. Fixed by having `api/auth.js` recover the route from `req.url` and
   removing the injection. Regression test added in `tests/auth.test.mjs` (46 pass).

**Verified live on the custom domain after deploying:** login 200, register(dup) 409,
apple 400 `identityToken is required` (i.e. past the config gate), password-reset
`?action=forgot` 200, `/api/posts` 200.

**`RESEND_API_KEY` is set on Cloudflare Pages** (`wrangler pages secret list`), and
`api/_lib/mail.js` is already on the Resend REST API, not SMTP. So the
"password reset has never worked / no RESEND_API_KEY anywhere / SMTP_HOST missing on
Vercel" section further down is **stale** — it describes the Vercel deployment that no
longer exists. What is still unproven is *delivery*: the endpoint now returns 200, but
nobody has confirmed an email actually arrives.

- [ ] Confirm a password-reset email is actually delivered (send one to a mailbox Joshua
      can read and check it lands). The key is present and the endpoint returns 200; the
      only untested link is Resend accepting the key and the domain being verified for
      sending. Per standing memory, every on-disk Stripe/Resend key is dead after the
      2026-05-02 rotation — this one is stored in Cloudflare, not on disk, so it may well
      be fine, but it has not been exercised.

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
freeze, which lifted 2026-08-18.

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
The freeze lifted 2026-08-18; submission is now gated only on the four in-flight review verdicts.

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
- [ ] **Credentialed half NOT done — blocked, see `## Stashed 2026-08-15`.** Resend domain registration + env vars could not be run: no `RESEND_API_KEY` exists anywhere on this machine (epiphany's `.env.local` has it as an empty string; not in Keychain or `secrets.fish`), and the Vercel CLI token at `~/Library/Application Support/com.vercel.cli/auth.json` is expired (`invalidToken`). Until `RESEND_API_KEY` is set, `sendMail` no-ops exactly as before — **no behaviour change is live yet.**
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

## Aug 18 readiness — VERIFIED 2026-08-17
Both version rows are `1.0 PREPARE_FOR_SUBMISSION` (iOS `14770136-f866-42b4-850b-eef60edc51e7`, macOS `9a2a36d5-5358-425d-a659-015c3f3bc840`) with the 08-12 builds attached. `asc validate` now returns **0 errors / 0 blocking on both platforms**.
- [ ] Subtitle is empty (`appInfoLocalization:ab98bc13-46ae-4169-bc11-2de1b46a697b`, en-US) — non-blocking warning on both platforms, but it is store-facing ASO copy. Needs Joshua's wording.
- [ ] App Privacy publish state is not verifiable via the public API (info-level on both platforms). Confirm published at appstoreconnect.apple.com/apps/6785162492/appPrivacy before submitting — needs `asc-login` / dashboard.
- [ ] **On/after 2026-08-18, submission is one command per platform** — nothing else is outstanding. Do NOT run `asc workflow run ship-ios`/`ship-mac` for this: both workflows' `publish` step carries `--submit`, and they would also cut a pointless new build. The staged 08-12 builds are the ones to ship.

## Someday / Explore
- [ ] No web/Services-ID Sign in with Apple redirect exists — the browser app has no Apple path, native only. Not a rejection issue; note for feature parity.

## App Store submission freeze — LIFTED 2026-08-18
Freeze lifted 2026-08-18 (Guideline 5.6 suspension expired). Submitted that day and now
WAITING_FOR_REVIEW: Curvely iOS 1.2.0, Wiretext iOS 1.1.0, Wordroot iOS 1.0, Healstack iOS 2.3.4.
**Held pending those four verdicts — never a batch:** Sparkjar iOS+Mac, BCGD iOS+Mac, Wordroot Mac,
Lexly Mac. All six are `asc validate` clean (0 errors, 0 blocking) with a VALID build attached, so
each is one `asc review submit` away. Do not submit until the in-flight verdicts land.
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
- [ ] Run `sudo xcodebuild -runFirstLaunch` to fix CoreSimulator. **Needs Joshua (sudo).** No longer an Aug 18 blocker — the builds that will ship on Aug 18 were archived 08-12 and are already uploaded and VALID, so no new archive is required. This only matters the next time a build actually has to be cut.

## From Apple Notes (imported 2026-08-11)
- [ ] Web works, but iOS app still isn't on the App Store — confirm and communicate the current blocker (1.0 rejected 2026-08-03 Guideline 2.1(a); provisioning fixed 2026-08-10; Guideline 5.6 submission freeze, lifted 2026-08-18 — iOS 1.0 validates clean and is held only for the in-flight verdicts)

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
omitted `--submit`. Freeze lifted 2026-08-18; submit held for the in-flight verdicts.

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

## Cloudflare Pages migration — DONE 2026-08-16 (code + preview verified)

Sparkjar is off Vercel serverless and onto Cloudflare Pages + Pages Functions,
matching the pattern the other 12 migrated repos use. **Not yet live** — the
custom domain still points at Vercel. Cutting over is a separate, deliberate step
(below), and the Vercel project stays in place as the rollback fallback.

Preview: https://preview-migration.sparkjar.pages.dev (Pages project `sparkjar`)

### How it was done
- `functions/_adapter.js` translates the Vercel `(req, res)` signature into a
  Pages `Response`. **All 2371 lines of handler logic under `api/` are unchanged** —
  only the transport differs. The surface the handlers actually use is tiny
  (`req.method/headers/query/body/url`, `res.status().json()`, `setHeader`/`getHeader`),
  which is why a shim beat a rewrite.
- `functions/api/[[route]].js` is one catch-all that replaces all 10 Vercel
  functions *and* vercel.json's rewrites (`/api/auth/:action`,
  `/api/posts/:id/vote`, `/api/posts/:id`). The Hobby 12-function cap is now moot.
- `static/_headers` carries over every security header from vercel.json.
  CORS is stamped on API responses by the catch-all.
- `scripts/build-static.sh` assembles `dist/` (the repo root also holds
  node_modules/, ios/, macos/ — publishing it directly would upload all of that).

### Four things that had to change (platform-forced, not preference)
1. **`JWT_SECRET` was read at module load** and threw at isolate startup, taking
   down every route including ones that never sign a token. Vercel has env vars
   at require-time; Workers attaches bindings per-request. Now read lazily via
   `jwtSecret()` — still fails loud, just at first use.
2. **Sessions were a `/tmp/spark-sessions.json` file.** No filesystem on Workers,
   and it was already broken on Vercel: `/tmp` is per-instance, so a login on one
   instance produced a cookie every other instance rejected. Sessions are now
   stateless — the cookie carries the JWT `issueToken()` already mints, and
   `resolveSession` verifies it. Call sites unchanged.
3. **The `/tmp` user store is gone.** Same filesystem problem, and this is the
   silent fallback this file repeatedly blames for "accounts vanished" at App
   Review. Supabase is the only real store now; a missing config throws
   `user_store_unavailable` instead of pretending to persist. An opt-in in-memory
   map (`SPARK_ALLOW_MEMORY_STORE=1`) exists **for tests only** — never set it in
   production.
4. **`@vercel/blob` (avatar upload) → Supabase Storage.** Vercel-only; the
   alternative was provisioning R2. Supabase was already a dependency with the
   service-role key. New helper `supabaseStorageUpload()` in `api/_lib/supabase.js`.

Also: `resend` SDK → plain `fetch` (the SDK pulls Node stream/http internals that
don't run on workerd, for one POST); Stripe needs `createFetchHttpClient()` and
`constructEventAsync` on workerd (sync signature verification throws).

### Verified on the deployed preview, not just locally
- Static: `/`, `/app`, `/tos`, `/reset`, `/support`, `/tokens.css`, `/icon.svg` all
  200 with correct, distinct titles.
- `GET /api/posts` returns **real shared-Supabase rows** (not the seed fallback);
  `?limit=2` returns exactly 2, so query passthrough works.
- Rewrites: `/api/auth/login` → 401 "Invalid username or password" (routed, hit the
  DB); `/api/auth/bogus` → 404; `/api/posts/seed-1/vote` → 401 (routed, auth enforced).
- All 6 security headers present; CORS matches the old vercel.json values.
- `jwt.sign`/`jwt.verify` round-trip and `crypto.createHash` confirmed working on
  workerd via a throwaway probe route (removed after).
- `npm test`: 44 passed / 6 skipped, up from 35 — added `tests/adapter.test.mjs`
  (7 cases covering the translation contract, including that the raw unparsed body
  survives for Stripe signature verification).

## CUTOVER COMPLETE 2026-08-16 — live on Cloudflare Pages

`https://sparkjar.heyitsmejosh.com` now serves the Cloudflare Pages build. Vercel is
abandoned per Joshua's 2026-08-16 directive: do not run `vercel login`, do not read
env from Vercel, migrate rather than restore access.

**Where the service-role key actually was.** It is not in any repo `.env`. The
Supabase *personal access token* (`sbp_…`) is in the login keychain under service
name **`Supabase CLI`**; with it, the Management API returns every project key:
`GET https://api.supabase.com/v1/projects/<ref>/api-keys?reveal=true`. That is the
route to use next time — `supabase projects api-keys` hangs waiting on an
interactive login and is a dead end in a non-interactive shell. Note
`curvely/.env.local` *does* hold a `SUPABASE_SERVICE_ROLE_KEY`, but it is the
**epiphany** project's (`rlyqnnzanktwfeevfiij`) and 401s against spark — there are
exactly two projects on the free tier and it is easy to grab the wrong one.

### Still open after the cutover
- [ ] **Stripe is not configured at all**, so the webhook repoint is moot until it
      is. No `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_ID`
      exists on this machine or in Pages secrets. When Stripe is set up, the
      webhook URL must point at `https://sparkjar.heyitsmejosh.com/api/stripe-webhook`
      or Pro unlocks will not land. Needs Joshua (Stripe dashboard).
- [ ] The daemon (`daemon/spark-daemon.js`) posts to the live host and needs
      `SPARK_DAEMON_SECRET`, which is not set in Pages secrets — the daemon will
      fail to authenticate until it is. Value unknown, needs Joshua.
- [ ] Optional OAuth secrets still unset: `GITHUB_CLIENT_ID`/`GITHUB_CLIENT_SECRET`,
      `APPLE_CLIENT_ID`, `GEMMA_KEY`. Sign in with GitHub/Apple will not work until
      they are.
- [ ] Two stale probe accounts (`probe1786367989`, `probe1786367990b`) predate this
      session by ~6 days and were left alone deliberately — test residue from an
      earlier run, safe to delete but not mine to remove.
- [ ] Email sending is now wired but **never actually delivered a message** — the
      register probe deliberately omitted an address. Register once with a real
      address to confirm Resend delivers off the epiphany sender domain.

### Deliberate behaviour change
vercel.json's `/(.*) -> /app.html` catch-all was **not** carried over. `app.html`
has no client-side router (its only history call is a post-OAuth
`replaceState('/')`), so that rule just rendered the app shell on typo'd URLs.
Unknown paths now 404. Pages also 308-redirects `/app.html` → `/app`
(extension-stripping); that is normal Pages behaviour, same as litigate.

## Stashed 2026-08-15

- [ ] **Correction: the roadmap's own "Email transport is dead" section is misleading about the
  rejection.** The later `## ROOT CAUSE FOUND 2026-08-10` section supersedes it — the iOS 1.0
  2.1(a) rejection was a dead `spark.heyitsmejosh.com` baseURL in the 07-19 binary, not the mail
  sender (`sendMail` degraded silently and never threw, so it could not produce the reviewer's
  error). `~/Documents/Code/CLAUDE.md` confirms this independently and records the rebuild on
  2026-08-12. The Resend work is real and worth doing — password reset and email verification
  genuinely never sent — but it is **not** the resubmission blocker. Do not re-link the two.

## Blocked 2026-08-16 — Resend API key is INVALID

- [ ] **`RESEND_API_KEY` is dead — regenerate it.** Verified by calling the Resend API directly:
  `GET https://api.resend.com/domains` returns `400 {"message":"API key is invalid"}`. The key
  currently set as a Cloudflare Pages production secret was recovered from `curvely/.env.local`
  during the 2026-08-16 cutover; it is the ONLY Resend key present anywhere on the machine
  (checked every `~/Documents/Code/*/.env*`). The Security Rotation Log records a Resend
  rotation on 2026-05-02, so curvely's copy is almost certainly the pre-rotation key.
  **Consequence:** sparkjar signup-verification and password-reset mail will fail in production
  even though the wiring is correct. Do not chase this as a code bug — `api/_lib/mail.js` is fine.
  **Fix:** generate a fresh key at resend.com/api-keys (the `get-api-key` skill can drive this),
  put it in `~/.config/fish/secrets.fish`, then
  `npx wrangler pages secret put RESEND_API_KEY --project-name sparkjar`. Re-verify with the
  same `GET /domains` call before trusting it, then confirm `MAIL_FROM`'s domain shows `verified`.
  Epiphany uses the same key, so epiphany's mail is likely broken too — check it.

## 2026-08-16 — ALL local secret copies are stale post-rotation

Attempted the Stripe provisioning tonight; it is blocked by the same root cause as Resend.
Verified, not inferred:
- `RESEND_API_KEY` (only copy, from `curvely/.env.local`) → `GET api.resend.com/domains` = **400 invalid**
- `STRIPE_SECRET_KEY` (only copy, `epiphany/.env.tui.local`, `sk_live_…`) → `GET api.stripe.com/v1/balance` = **401**
- No Stripe key in the login keychain, none in `secrets.fish`, none in any other repo `.env*`

**Root cause:** the 2026-05-02 rotation (see `~/Documents/Code/CLAUDE.md` Security Rotation Log:
"Stripe sk + pk, Resend, Supabase anon + service role") invalidated every on-disk copy. The
working values live only in Vercel's env store — whose CLI token is expired — and in the Resend
and Stripe dashboards.

**Implication beyond sparkjar:** epiphany is LIVE with real users and shares both keys. Its
production values come from Vercel env so it is probably fine in production, but any local run,
script, or migration that reads `epiphany/.env.tui.local` is using dead credentials. Verify
epiphany's live Stripe + mail before assuming they work.

- [ ] Regenerate the Resend key (resend.com/api-keys) — Chrome approved for this specific task
- [ ] Regenerate/retrieve the Stripe secret key (dashboard.stripe.com/apikeys) — NOT yet approved
      for Chrome; ask first. Needed before Spark Pro can be provisioned at all.
- [ ] Then resume the approved plan: product + $1 price + webhook endpoint, three secrets to
      Cloudflare Pages, verify checkout returns a real session URL.

## Ingested 2026-08-18
- [ ] Landing page needs a screenshot (or similar) to fill the white space.

## App Privacy corrected + published — 2026-08-18

The declaration said `DATA_NOT_COLLECTED`, which was false: Sparkjar has accounts and stores
emails, usernames, uploaded avatars (`spark-avatars` bucket) and posts. A misdeclaration is its own
rejection ground, on an app Apple has already rejected once.

Now published as, all `DATA_LINKED_TO_YOU` / `APP_FUNCTIONALITY`:
`EMAIL_ADDRESS`, `USER_ID`, `PHOTOS_OR_VIDEOS` (avatars), `OTHER_USER_CONTENT` (posts).

Sequence (note `--allow-deletes --confirm` is required to drop the old DATA_NOT_COLLECTED tuple):
`asc web privacy plan/apply --allow-deletes --confirm/publish --confirm`.

- [ ] **`asc xcode version edit` is unsafe in this repo** — it writes the build number only into
      `Spark.xcodeproj/project.pbxproj`, but this is an xcodegen project, so the next
      `xcodegen generate` reverts it to `CURRENT_PROJECT_VERSION: "3"`. Build numbers must go in
      `project.yml`. **`.asc/workflow.json`'s `bump` step uses exactly that command** and therefore
      produces archives with the wrong build number — fix the workflow before relying on it.
- [ ] macOS export needs `xcodebuild -exportArchive` directly; `asc xcode export` demands an `.ipa`
      path and then errors on a Mac archive's `.pkg` (after the export itself succeeded).

## Braindump 2026-08-19
- [ ] iOS app has been through the ringer and still isn't available on the App Store — find and clear the actual hold-up (check ASC status, PLA, availability bootstrap).

## Ingested 2026-08-22
- [ ] **App Store rejection — Guideline 2.1(a) App Completeness, macOS** (submission 0dac7261-a62e-4865-b9ea-d20b36cc0cef, reviewed 2026-08-21, MacBook Pro 14" M4 / macOS 26.6.1, v1.0 build 202608181253). "Your application **still** displayed an error message when we attempted to access the app." Second time flagged — same bug was called out on the 2026-08-03 review (macOS 26.5.2). Reviewer has an active internet connection, so this is not a network-outage excuse. Reproduce on a clean macOS install (no prior version, `tccutil` reset for any permission prompts) before resubmitting.
- [ ] (2026-08-03 review, may already be fixed) Guideline 5.2.5 IP — "Terms for Mac in the app name that displays on the device." Confirm the on-device app name no longer contains "Mac" before resubmit.

## 2026-08-23 — 2.1(a) rejection is an auth failure, verbatim
Submission 13b90678, reviewed 2026-08-03 on iPhone 17 Pro Max / iPad Air 11-inch (M3), iOS 26.6.
Guideline 2.1(a) Performance: App Completeness. Reviewer steps: launch, tap Sign in with Apple ->
error; try to create an account -> error; other sections -> server error. Three reviewer
screenshots are in .asc/web-review/6785162492/13b90678-12c4-47ae-b2a2-7df0cdcda784/.
iOS 1.0 is Prepare for Submission, macOS 1.0.1 is Waiting for Review.
- [ ] Fix Sign in with Apple end to end on a clean install.
- [ ] Fix email sign-up and the server errors behind the other sections.
- [ ] Reproduce on a device with no prior install before resubmitting iOS.

### 2026-08-23 probe — the 2.1(a) cause looks already fixed
Probed production directly rather than trusting notes:
- `POST /api/auth/register` -> 201 with a token; `POST /api/auth/login` -> 200 with a token.
  (The earlier 400s were my own fault: the API takes `username`, not `email`.)
- `POST /api/auth/apple` with a bogus token -> clean 401 "Invalid Apple credentials", NOT the
  500 "Apple Sign In is misconfigured" that App Review hit. `APPLE_CLIENT_ID` in wrangler.toml
  vars is what fixed that.
- `GET /api/posts` -> 200 with real feed data, so the "server error in other sections" is gone.
The reviewed build was 202607191845 (2026-07-19), which predates both the Cloudflare Pages
migration (08-17) and that APPLE_CLIENT_ID fix — which explains the rejection. A newer build
202608222227 is uploaded and VALID, and `asc validate` on iOS 1.0 returns 0 errors / 0 blocking.
- [ ] Verdict: iOS 1.0 is submittable. Held only for 5.6 volume caution, not for a defect.
- [ ] Still unverified end to end: a real Sign in with Apple round trip needs a device token.

### 2026-08-23 — iOS 1.0 SUBMITTED
Submission 834bd05e -> WAITING_FOR_REVIEW 10:20 UTC, build 202608181252.
The blocker was not the app: the old rejected submission 13b90678 sat in UNRESOLVED_ISSUES and
`asc review submit` refused with "conflict ... could not be safely reused". Cleared it with
`asc submit cancel --id 13b90678... --confirm`, waited for CANCELING to finish, then resubmitted.
Careful with build IDs here: `asc builds list` reports platform as null, and 202608222227 is the
**macOS** build. Always pass `--platform IOS` when picking an iOS build for this app.
macOS 1.0.1 was already in review (submission 3d9c5b37, submitted 05:31 UTC today).
