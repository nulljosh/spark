# Sparkjar

Version: v2.2.0

## Monetization (defined 2026-07-18, not built yet)
No payment infra exists — no Stripe, no `is_pro`/tier column, no schema for
it. Decided what "Spark Pro" sells before building anything, so the eventual
implementation has a real target instead of being invented mid-build:

- **Free**: post, comment, browse. Current anti-spam limit is 10 posts per
  60s per IP (`api/posts.js:143`, `checkRateLimit`) — not a real daily cap,
  just spam protection.
- **Spark Pro**: unlimited posts (raise/remove the rate-limit ceiling for
  Pro accounts), plus 24h pinned/priority visibility on new posts.

Not started: no Supabase migration for a pro/subscription column, no
Stripe product, no checkout/webhook route, no auth-to-billing wiring
(`api/auth.js`'s session pattern is the right hook point once this is
built — see Epiphany's `server/api/stripe.js` + `gates.js` for the
checkout/webhook/gate shape to copy). This is a multi-hour build on its
own — don't attempt it as a quick follow-on to a docs pass.

## From Spark.pdf (imported 2026-07-01)
- [ ] Sync app icon into portfolio (nulljosh.github.io) — icon was bumped in Spark repo but portfolio still shows the old one
- [ ] Idea: self-regulating idea forum — infinite AI-generated ideas via a free model (Gemma/Qwen), with a second model (Owen?) filtering its own output; eventually add law/trademark search + monetization/commercialization hooks. Exploratory, no deadline.

## Recovery note (2026-06-21)
Local checkout and GitHub repo both went missing before this date (cause unconfirmed — no Time Machine/APFS snapshot/trash copy existed to check). Source was recovered from Vercel's deployment-files API (`GET /v8/deployments/{id}/files/{fileId}`, v6 of the same endpoint is disabled) against the latest deployment, plus the live-served frontend at sparkjar.heyitsmejosh.com as a cross-check (the frontend is unbundled, so the served files are the actual source). Risk: any local edits made between the last deploy and the original deletion are not captured — this is the latest deployed snapshot, not necessarily the latest *written* code.

## Shipped (2026-06-28)
- [x] ToS checkbox required on register (blocks submit if unchecked) — `index.html`, `/tos.html`
- [x] GitHub Sign In/Up — `api/auth/github.js`, `api/auth/github-callback.js`
- [x] Supabase migration `006_github_oauth.sql` applied (github_id, avatar_url columns)
- [x] GITHUB_CLIENT_ID + GITHUB_CLIENT_SECRET set in Vercel production

## Rules

- No emojis
- No build step -- everything runs from index.html
- Mobile-first layout
- Respect the existing visual language; keep UI minimal and fast to scan
- Seed data fallback when Supabase is unreachable

## Run

```bash
npx serve .
npm test
node daemon/spark-daemon.js --once   # test daemon manually
```

## Layout

Feed uses CSS grid (`repeat(auto-fill, minmax(320px, 1fr))`), 3-line content clamp. No box-shadows anywhere.

## Theme

One preference for the whole site: `spark_theme` in localStorage, `dark` by
default. `theme.js` loads synchronously in every page's `<head>`, stamps
`data-theme` on `<html>` before first paint, wires any `[data-theme-toggle]`
button, and swaps any `[data-shot-dark][data-shot-light]` image. Pages declare
both palettes under `:root[data-theme="dark"]` and `:root[data-theme="light"]`
-- a token defined in only one block silently drops the declaration that uses
it, so keep the two blocks symmetric.

Hero screenshots are captured per theme:

```bash
npm i --no-save playwright && node scripts/screenshots.mjs
```

## Key Files

- index.html (marketing landing page: HTML + CSS + JS)
- theme.js (shared light/dark control for every page -- see Theme below)
- api/posts.js (GET/POST posts, seed data fallback)
- api/enrich.js (POST=user requests enrichment, GET=daemon poll, PATCH=daemon writes)
- api/idea-base.js (POST=create ideabase, GET=list, PATCH=daemon updates post_ids)
- api/notes.js (GET=export post as markdown download)
- api/_lib/supabase.js (Supabase REST wrapper)
- daemon/spark-daemon.js (local Mac daemon: polls, runs CLAUDECODE="" claude --print, patches back)
- daemon/prompts.js (Claude prompt templates for enrichment + ideabase)
- daemon/notes.js (markdown export/import helpers)
- sw.js

## Daemon

- Runs every 5 min via LaunchAgent: `~/Library/LaunchAgents/com.spark.daemon.plist`
- Invokes: `CLAUDECODE="" claude --print "..."` (no API key -- uses Claude Max)
- Secret: `SPARK_DAEMON_SECRET` env var (set in Vercel + `~/.spark/daemon.env`)
- Logs: `~/.spark/daemon.log`
- Symlink: `~/.local/bin/spark-daemon -> daemon/spark-daemon.js`

## Load LaunchAgent

```bash
launchctl load ~/Library/LaunchAgents/com.spark.daemon.plist
launchctl list | grep spark
tail -f ~/.spark/daemon.log
```

## Set Vercel Env

```bash
vercel env add SPARK_DAEMON_SECRET
# value: generate with `openssl rand -hex 32` -- never commit it.
# Must match the value in ~/.spark/daemon.env (used by the local daemon).
```

## Native Companions

| Platform | Dir | Bundle ID | Status |
|---|---|---|---|
| iOS | ios/ | com.heyitsmejosh.spark | Submission in progress, v2.2.0 build 3 |
| macOS | macos/ | com.heyitsmejosh.spark.mac | Submission in progress, v1.0.0 |
| watchOS | watchos/ | com.heyitsmejosh.spark.watchos | Bundled with iOS; no login UI (view-only without iOS pre-auth) |

Build with `xcodegen generate` in each platform dir. Screenshots in `screenshots/`.

## Migration

Run `supabase/migrations/20260410000006_llm_enrichment.sql` via Supabase SQL editor.

## Roadmap (2026-07-18 nightly wrap)
- **Sparkjar iOS purple icon — root cause FIXED 2026-07-18**: Both iOS provisioning profiles ("Spark iOS App Store", "Spark Widgets App Store") were `INVALID` — zero certificates attached, and the App Group entitlement baked into them was an empty array despite APP_GROUPS capability being enabled on the bundle ID. Deleted + recreated both profiles via `asc profiles create` with a valid IOS_DISTRIBUTION cert; new profiles correctly embed `group.com.jt.spark`. Installed locally, removed stale same-named cached profiles. Archive now succeeds. Along the way also fixed: widgets extension Info.plist was missing `NSExtensionPointIdentifier` (App Store upload rejects this — code 90348) and had a mismatched `CFBundleVersion` vs the parent app; both fixed in `ios/project.yml`'s `SparkWidgetsExtension` target.
- **NEXT SESSION — finish the ship**: archive is verified working (`.asc/artifacts/Spark-iOS.xcarchive`, v2.2.0 build 3). Still need: `asc xcode export` (ExportOptions.plist, `-allowProvisioningUpdates`) then `asc builds upload`/`asc publish testflight` to actually get the new icon onto ASC/TestFlight. Export was interrupted mid-run tonight, not failed — just re-run it.
