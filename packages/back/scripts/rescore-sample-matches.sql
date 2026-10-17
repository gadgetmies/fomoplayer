-- Re-score one uploaded audio sample against every fingerprinted preview
-- and bring its persisted matches in line, mirroring findExactMatchForSample
-- (two-stage) + persistSampleMatches in routes/admin/db.js.
--
-- Run directly against the DB when the HTTP bulk-scoring endpoint cannot
-- finish inside the server's 25 s connect-timeout (a full-corpus scoring
-- pass per sample takes minutes):
--
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -v sid=<sample_id> \
--     -f packages/back/scripts/rescore-sample-matches.sql
--
-- Parameters match the production defaults: threshold 0.008, bucket 0.5 s,
-- peak floor 3, top 10 persisted. Keep them in sync with
-- SAMPLE_MATCH_DEFAULT_THRESHOLD / SAMPLE_MATCH_BUCKET_SECONDS /
-- SAMPLE_MATCH_PEAK_BUCKET_MIN and the scorer SQL.
--
-- Like the deployed persistSampleMatches (c53094c41), this UPSERTS instead
-- of delete+insert: stale (sample, preview) pairs are removed, existing
-- pairs are updated in place and new pairs inserted. Updating in place
-- preserves matched_at and notified_at, so the hourly notifySampleMatches
-- job only emails pairs that are genuinely new — a blanket delete+insert
-- here re-sent the same match digest on every 3-hourly rescore pass
-- (observed 2026-10-16/17).
BEGIN;

CREATE TEMP TABLE _rescore_matches ON COMMIT DROP AS
WITH sample_hashes AS (
  SELECT DISTINCT user_notification_audio_sample_fingerprint_hash AS hash
  FROM user_notification_audio_sample_fingerprint
  WHERE user_notification_audio_sample_id = :sid
),
sample_hash_count AS (SELECT COUNT(*)::INTEGER AS count FROM sample_hashes),
candidates AS (
  SELECT stpf.store__track_preview_id,
         COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::INTEGER AS matching_hashes
  FROM store__track_preview_fingerprint stpf
    INNER JOIN sample_hashes sh ON stpf.store__track_preview_fingerprint_hash = sh.hash
  GROUP BY stpf.store__track_preview_id
  HAVING COUNT(DISTINCT stpf.store__track_preview_fingerprint_hash)::FLOAT /
         NULLIF((SELECT count FROM sample_hash_count), 0) >= 0.008
  ORDER BY matching_hashes DESC
  LIMIT 100
),
matched_positions AS (
  SELECT c.store__track_preview_id,
         ROUND((pf.store__track_preview_fingerprint_position
                - sf.user_notification_audio_sample_fingerprint_position) / 0.5::FLOAT
         ) * 0.5::FLOAT AS delta_t_bucket
  FROM candidates c
    INNER JOIN store__track_preview_fingerprint pf
      ON pf.store__track_preview_id = c.store__track_preview_id
    INNER JOIN user_notification_audio_sample_fingerprint sf
      ON sf.user_notification_audio_sample_id = :sid
     AND sf.user_notification_audio_sample_fingerprint_hash
         = pf.store__track_preview_fingerprint_hash
),
bucket_counts AS (
  SELECT store__track_preview_id, delta_t_bucket, COUNT(*)::INTEGER AS bucket_count
  FROM matched_positions
  GROUP BY store__track_preview_id, delta_t_bucket
),
peak_per_preview AS (
  SELECT DISTINCT ON (store__track_preview_id)
    store__track_preview_id, bucket_count AS peak_bucket_count
  FROM bucket_counts
  ORDER BY store__track_preview_id, bucket_count DESC, delta_t_bucket ASC
)
SELECT ppp.store__track_preview_id, ppp.peak_bucket_count AS score
FROM peak_per_preview ppp
  INNER JOIN candidates c ON c.store__track_preview_id = ppp.store__track_preview_id
WHERE ppp.peak_bucket_count >= 3
ORDER BY ppp.peak_bucket_count DESC, c.matching_hashes DESC
LIMIT 10;

-- Remove pairs that no longer score.
DELETE FROM user_notification_audio_sample_match
WHERE user_notification_audio_sample_id = :sid
  AND store__track_preview_id NOT IN (SELECT store__track_preview_id FROM _rescore_matches);

-- Upsert the rest; existing pairs keep matched_at/notified_at.
INSERT INTO user_notification_audio_sample_match (
  user_notification_audio_sample_id,
  store__track_preview_id,
  user_notification_audio_sample_match_score,
  user_notification_audio_sample_match_threshold,
  user_notification_audio_sample_match_bucket_seconds
)
SELECT :sid, store__track_preview_id, score, 0.008, 0.5
FROM _rescore_matches
ON CONFLICT (user_notification_audio_sample_id, store__track_preview_id) DO UPDATE
SET user_notification_audio_sample_match_score          = EXCLUDED.user_notification_audio_sample_match_score,
    user_notification_audio_sample_match_threshold      = EXCLUDED.user_notification_audio_sample_match_threshold,
    user_notification_audio_sample_match_bucket_seconds = EXCLUDED.user_notification_audio_sample_match_bucket_seconds;

COMMIT;
