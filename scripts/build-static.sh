#!/usr/bin/env bash
# Assemble dist/ for Cloudflare Pages.
#
# ponytail: a copy, not a bundler. Sparkjar has no build step by design
# ("everything runs from index.html" — CLAUDE.md), so all this does is pick the
# publishable files out of a repo root that also holds node_modules/, ios/,
# macos/, api/ and friends. Publishing the root directly would upload all of it.
set -euo pipefail

cd "$(dirname "$0")/.."
rm -rf dist
mkdir -p dist

# Static pages and assets.
cp -- *.html dist/
cp -- *.svg dist/
cp manifest.json sw.js tokens.css devices.css theme.js webmcp.js dist/

# Pages control files. No _redirects: vercel.json's `/(.*) -> /app.html` catch-all
# was a Vercel routing artifact, not a feature — app.html has no client-side
# router (its only history call is a post-OAuth replaceState to '/'). Pages serves
# the real files directly, so unknown paths correctly 404 instead of rendering
# the app shell.
cp static/_headers dist/

# Optional directories — only copied when present.
# Guarded with `|| true` so a missing dir doesn't trip `set -e`.
if [ -d screenshots ]; then cp -R screenshots dist/; fi

echo "dist/ built:"
find dist -type f | sort | sed 's/^/  /'
