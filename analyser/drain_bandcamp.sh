#!/bin/bash
# Fingerprint Bandcamp previews (which are full tracks — expect ~10-30k
# fingerprints per preview instead of a Beatport excerpt's ~4k).
#
# The DEPLOYED queue endpoint only serves previews with stored URLs, and
# Bandcamp previews have none (their stream URLs expire), so this script
# exports the job list straight from the production DB and feeds it to
# panako_processor --jobs-file. The worker resolves each stream URL from the
# release page (rate-limited, one page per release — the ORDER BY release_url
# below maximises the resolver's per-release cache hits) and marks previews
# Bandcamp no longer streams as missing.
#
# Once a backend with the Bandcamp-aware queryPreviewsWithoutFingerprint is
# deployed, plain drain_previews.sh covers Bandcamp too and this script is
# redundant.
set -u
# Runs from the checkout the script lives in (a worktree works too); point
# ANALYSER_VENV at another checkout's venv to reuse it.
cd "$(dirname "$0")" || exit 1
source "${ANALYSER_VENV:-venv}/bin/activate"
export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"
: "${FOMOPLAYER_API_URL:?set FOMOPLAYER_API_URL to the API to fingerprint against}"
export FOMOPLAYER_API_URL
# Bandcamp previews are FULL tracks: each one is a ~5MB mp3 plus a ~50MB
# transient wav, so a batch consumes ~batch*55MB of disk before cleanup.
# 100 filled the disk (2026-10-16); 50 keeps the transient under ~3GB.
BATCH="${BATCH:-50}"
JOBS_FILE=bandcamp_jobs.json
SKIPLIST_FILE=zero_fingerprint_previews.txt

while true; do
  DBURL=$(railway variables -s pgvector -e production --kv 2>/dev/null | grep '^DATABASE_URL=' | cut -d= -f2-)
  if [ -z "$DBURL" ]; then echo "could not fetch DATABASE_URL, retrying in 60s"; sleep 60; continue; fi

  # Exclude previews the worker has skiplisted as zero-fingerprint (sample-pack
  # one-shots etc. — the deployed backend writes no meta row for empty uploads
  # until the upsert fix ships, so without this they are re-exported forever
  # and eventually fill the whole batch: seen 2026-10-17, the worker then
  # filtered all 50 jobs and its rc=2 made this loop think it was DRAINED).
  SKIP_IDS=$(grep -E '^[0-9]+$' "$SKIPLIST_FILE" 2>/dev/null | paste -sd, -)

  psql "$DBURL" -tA -v ON_ERROR_STOP=1 <<SQL > "$JOBS_FILE"
SELECT COALESCE(json_agg(j), '[]') FROM (
  SELECT p.store__track_preview_id AS preview_id,
         st.store__track_store_id AS store_track_id,
         (SELECT sr.store__release_url
          FROM release__track rt
            JOIN store__release sr ON sr.release_id = rt.release_id
          WHERE rt.track_id = st.track_id
            AND sr.store_id = st.store_id
          LIMIT 1) AS release_url
  FROM store__track_preview p
    JOIN store__track st USING (store__track_id)
    JOIN store s USING (store_id)
    LEFT JOIN store__track_preview_fingerprint_meta m USING (store__track_preview_id)
  WHERE m.store__track_preview_id IS NULL
    AND s.store_name = 'Bandcamp'
    AND NOT p.store__track_preview_missing
    AND p.store__track_preview_id NOT IN (${SKIP_IDS:-0})
  ORDER BY release_url NULLS LAST, p.store__track_preview_id
  LIMIT $BATCH
) j;
SQL
  if [ $? -ne 0 ]; then echo "jobs export failed, retrying in 60s"; sleep 60; continue; fi
  if [ "$(cat "$JOBS_FILE")" = "[]" ]; then echo DRAINED; break; fi

  python panako_processor.py --previews --jobs-file "$JOBS_FILE" --workers 4 --score-after 0
  rc=$?
  if [ $rc -eq 2 ]; then echo DRAINED; break; fi
  if [ $rc -ne 0 ]; then echo "rc=$rc, retrying in 60s"; sleep 60; fi
done
echo loop-ended
