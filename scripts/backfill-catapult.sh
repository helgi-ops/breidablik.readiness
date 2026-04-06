#!/bin/bash
# Backfill Catapult GPS data for the last N days
# Usage:  bash scripts/backfill-catapult.sh           (defaults: 35 days, localhost:3000)
#         bash scripts/backfill-catapult.sh 60         (last 60 days)
#         bash scripts/backfill-catapult.sh 35 https://your-domain.com

DAYS=${1:-35}
BASE_URL=${2:-http://localhost:3000}
ENDPOINT="$BASE_URL/api/integrations/catapult/daily-sync"

echo "========================================"
echo " Catapult backfill — last $DAYS days"
echo " Endpoint: $ENDPOINT"
echo "========================================"
echo ""

success=0
failed=0
skipped=0

for i in $(seq $((DAYS - 1)) -1 0); do
  # Cross-platform date arithmetic
  if date --version >/dev/null 2>&1; then
    # GNU date (Linux)
    TARGET=$(date -d "$i days ago" +%Y-%m-%d)
  else
    # BSD date (macOS)
    TARGET=$(date -v -${i}d +%Y-%m-%d)
  fi

  printf "  [%2d/%d] %s  " "$((DAYS - i))" "$DAYS" "$TARGET"

  RESPONSE=$(curl -s -w "\n%{http_code}" -X POST "$ENDPOINT" \
    -H "Content-Type: application/json" \
    -d "{\"date\": \"$TARGET\"}")

  HTTP_CODE=$(echo "$RESPONSE" | tail -1)
  BODY=$(echo "$RESPONSE" | head -1)

  if [ "$HTTP_CODE" = "200" ]; then
    # Extract storedCount and activitiesFetched from JSON
    STORED=$(echo "$BODY" | grep -o '"storedCount":[0-9]*' | grep -o '[0-9]*')
    ACTIVITIES=$(echo "$BODY" | grep -o '"activitiesFetched":[0-9]*' | grep -o '[0-9]*')
    STORED=${STORED:-0}
    ACTIVITIES=${ACTIVITIES:-0}

    if [ "$ACTIVITIES" = "0" ]; then
      echo "— no activities"
      ((skipped++))
    else
      echo "✓ $ACTIVITIES activities → $STORED rows stored"
      ((success++))
    fi
  else
    echo "✗ HTTP $HTTP_CODE"
    echo "    $BODY"
    ((failed++))
  fi

  # Small pause to avoid hammering Catapult API
  sleep 0.5
done

echo ""
echo "========================================"
echo " Done.  Success: $success  |  No data: $skipped  |  Failed: $failed"
echo "========================================"
