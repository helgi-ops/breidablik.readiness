#!/bin/bash
# Backfill Breiðablik Catapult data from 2026-02-01 through today.
#
# Use this AFTER Catapult support has re-processed IMA Free Running on
# their side so the API returns the 8-band stride data per activity.
#
# Runs day-by-day against production /api/integrations/catapult/daily-sync
# with the Catapult cron-secret so it auth-bypasses the coach token.
# Each day is one HTTP call (~5-30s depending on session count) so the
# Vercel 5-min lambda limit never trips. Total run ≈ 15-30 minutes for
# 100 days.
#
# Usage:
#   bash scripts/backfill-ima-from-feb.sh
#
# Optional overrides:
#   BACKFILL_FROM=2026-02-01 BACKFILL_TO=2026-05-11 bash scripts/backfill-ima-from-feb.sh

set -u

# ── Config ────────────────────────────────────────────────────────────────
BASE_URL="${BASE_URL:-https://app.micropulse.is}"
CRON_SECRET="${CATAPULT_CRON_SECRET:-82815d0f0ef1510acc11025b1d63c853e0332bc5c9b9bc01}"
FROM="${BACKFILL_FROM:-2026-02-01}"
TO="${BACKFILL_TO:-$(date +%Y-%m-%d)}"

ENDPOINT="$BASE_URL/api/integrations/catapult/daily-sync?secret=$CRON_SECRET"

echo "============================================================"
echo " Catapult IMA backfill"
echo "   Range : $FROM → $TO"
echo "   Target: $BASE_URL"
echo "============================================================"
echo ""

# ── Date iteration (cross-platform) ──────────────────────────────────────
date_to_epoch() {
  # GNU date (Linux) vs BSD date (macOS)
  if date --version >/dev/null 2>&1; then
    date -d "$1" +%s
  else
    date -j -f "%Y-%m-%d" "$1" +%s
  fi
}
epoch_to_date() {
  if date --version >/dev/null 2>&1; then
    date -d "@$1" +%Y-%m-%d
  else
    date -j -f "%s" "$1" +%Y-%m-%d
  fi
}

FROM_EPOCH=$(date_to_epoch "$FROM")
TO_EPOCH=$(date_to_epoch "$TO")
ONE_DAY=86400

TOTAL=$(( (TO_EPOCH - FROM_EPOCH) / ONE_DAY + 1 ))
success=0
empty=0
failed=0
i=0

cur=$FROM_EPOCH
while [ "$cur" -le "$TO_EPOCH" ]; do
  i=$((i + 1))
  TARGET=$(epoch_to_date "$cur")

  printf "  [%3d/%3d] %s  " "$i" "$TOTAL" "$TARGET"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"date\": \"$TARGET\", \"skipPush\": true}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [ "$HTTP_CODE" = "200" ]; then
    STORED=$(echo "$BODY" | grep -o '"storedCount":[0-9]*' | head -1 | grep -o '[0-9]*')
    ACTIVITIES=$(echo "$BODY" | grep -o '"activitiesFetched":[0-9]*' | head -1 | grep -o '[0-9]*')
    STORED=${STORED:-0}
    ACTIVITIES=${ACTIVITIES:-0}

    if [ "$ACTIVITIES" = "0" ]; then
      echo "— no sessions"
      empty=$((empty + 1))
    else
      echo "✓ $ACTIVITIES sessions → $STORED rows"
      success=$((success + 1))
    fi
  else
    echo "✗ HTTP $HTTP_CODE"
    echo "      $(echo "$BODY" | head -c 200)"
    failed=$((failed + 1))
  fi

  cur=$((cur + ONE_DAY))
  # Throttle to avoid hammering Catapult API
  sleep 1
done

echo ""
echo "============================================================"
echo " Done."
echo "   Sessions imported : $success days"
echo "   Empty days        : $empty days"
echo "   Failed            : $failed days"
echo "============================================================"

if [ "$failed" -gt 0 ]; then
  echo ""
  echo " ⚠  Some days failed — re-run the script or check Vercel logs."
  exit 1
fi
