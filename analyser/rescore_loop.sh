#!/bin/bash
# Re-score the still-unmatched samples every 3 h so new preview
# fingerprints surface as suspected matches in the app.
RESCORE_SQL="$(cd "$(dirname "$0")/.." && pwd)/packages/back/scripts/rescore-sample-matches.sql"
while true; do
  DBURL=$(railway variables -s pgvector -e production --kv 2>/dev/null | sed -n 's/^DATABASE_URL=//p')
  if [ -z "$DBURL" ]; then echo "no DATABASE_URL, retry in 10m"; sleep 600; continue; fi
  for sid in 13 14 15 16 17 18 19; do
    echo "[$(date '+%F %T')] rescoring sample $sid"
    psql "$DBURL" -v ON_ERROR_STOP=1 -v sid=$sid -f "$RESCORE_SQL" | grep -E 'INSERT|ERROR'
  done
  echo "[$(date '+%F %T')] rescore pass done, sleeping 3h"
  sleep 10800
done
