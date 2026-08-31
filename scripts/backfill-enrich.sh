#!/usr/bin/env bash
# One-off: enrich every post that never got a spec/plan.
#
# The daily cron only enriches the idea it just generated, so the backlog that
# accumulated while the feed was dead needs one manual pass. Not scheduled.
#
# Usage: SPARK_DAEMON_SECRET=... bash scripts/backfill-enrich.sh
set -euo pipefail

SITE="${SPARK_API_URL:-https://sparkjar.heyitsmejosh.com}"
: "${SPARK_DAEMON_SECRET:?set SPARK_DAEMON_SECRET}"

ids=$(curl -sf "$SITE/api/posts" \
  | python3 -c 'import sys,json; print("\n".join(p["id"] for p in json.load(sys.stdin)["posts"] if not p.get("enriched")))')

if [ -z "$ids" ]; then echo "nothing to enrich"; exit 0; fi
echo "$(echo "$ids" | wc -l | tr -d ' ') post(s) to enrich"

for id in $ids; do
  code=$(curl -s -o /tmp/enrich.out -w '%{http_code}' -X POST "$SITE/api/ai?type=enrich" \
    -H "Authorization: Bearer $SPARK_DAEMON_SECRET" \
    -H 'Content-Type: application/json' \
    -d "{\"id\":\"$id\"}")
  echo "$id -> $code$( [ "$code" = 200 ] || echo "  $(head -c 120 /tmp/enrich.out)" )"
  sleep 2   # the model is the bottleneck; no reason to hammer it
done
