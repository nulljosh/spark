#!/usr/bin/env bash
# Set Sparkjar's Resend API key, validating it BEFORE storing it.
#
# The whole 2026-08 "the key keeps expiring" saga happened because an invalid
# key was stored and failed silently for months. This validates against Resend
# first, so a bad key can never reach production again.
#
# Usage: ./scripts/set-resend-key.sh     (prompts; key never touches shell history)
set -euo pipefail

PROJECT=sparkjar
NAME=RESEND_API_KEY

printf 'Paste the Resend API key (input hidden), then Enter: '
read -rs KEY
printf '\n'

# ponytail: shape check first -- catches truncated/partial pastes with no network call.
if [[ ! $KEY =~ ^re_[A-Za-z0-9]+_[A-Za-z0-9]{20,}$ ]]; then
  echo "REJECTED: not a Resend key shape (expected re_xxxxxxxx_yyyyyyyy...). Got ${#KEY} chars." >&2
  exit 1
fi

echo "Shape OK (${#KEY} chars). Validating against Resend..."
code=$(curl -s -o /tmp/resend_check.$$ -w '%{http_code}' \
  -H "Authorization: Bearer $KEY" https://api.resend.com/domains)
if [[ $code != 200 ]]; then
  echo "REJECTED: Resend says HTTP $code -- $(cat /tmp/resend_check.$$)" >&2
  rm -f /tmp/resend_check.$$
  exit 1
fi

echo "Key is VALID. Verified sending domains:"
python3 -c "import json,sys; [print('  -',d['name'],d['status']) for d in json.load(open('/tmp/resend_check.$$'))['data']]"
rm -f /tmp/resend_check.$$

printf '%s' "$KEY" | npx wrangler pages secret put "$NAME" --project-name "$PROJECT"
echo
echo "Stored. Now confirm delivery:"
echo "  curl -X POST 'https://sparkjar.heyitsmejosh.com/api/auth/password-reset?action=forgot' \\"
echo "    -H 'Content-Type: application/json' -d '{\"username\":\"appreview\"}'"
