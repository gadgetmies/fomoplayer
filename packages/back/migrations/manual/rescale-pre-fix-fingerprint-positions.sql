-- rescale-pre-fix-fingerprint-positions.sql
--
-- One-shot operator migration, successor to
-- scale-fingerprint-positions.sql (which was NEVER run in production —
-- verified 2026-10-11: every fingerprint row extracted before the
-- 2026-05-24 fix still carries positions inflated by 23.222×).
--
-- Why the original script must NOT be run now
-- --------------------------------------------
-- scale-fingerprint-positions.sql divides EVERY row by 23.222. That was
-- correct when all rows were pre-fix; today the corpus is mixed:
-- ~36k previews and samples 13+ were extracted post-fix with correct
-- second-scale positions, and blanket division would corrupt them.
--
-- What this script does instead
-- -----------------------------
-- Divides positions by 23.222 only for fingerprint sets whose
-- *_fingerprint_meta.extracted_at predates 2026-02-01. The timestamp
-- gap is clean on both tables (verified in production 2026-10-11):
--
--   store__track_preview_fingerprint_meta:  21 rows on 2026-01-25,
--     then nothing until 2026-05-31 (post-fix).
--   user_notification_audio_sample_fingerprint_meta: samples 6, 9, 10,
--     11, 12 on 2026-01-25/27; samples 13+ from 2026-05-31 (post-fix).
--
-- Symptom this fixes: Stage 2 temporal-coherence scoring buckets
-- Δt = preview_pos − sample_pos at SAMPLE_MATCH_BUCKET_SECONDS. With a
-- 23.222×-inflated side, a true alignment never concentrates in one
-- bucket, so genuine matches score at the noise floor (e.g. sample 10
-- "serious sound.wav" scored 4 against its correct preview; after
-- rescaling the same pair peaks at 29).
--
-- Idempotency
-- -----------
-- NOT idempotent (running twice halves positions again), but safe to
-- re-run in the sense that the WHERE clause is stable: track execution
-- in the ops log. The sanity-check SELECTs at the end detect obviously
-- wrong states.
--
-- After running
-- -------------
-- Re-score every sample so persisted matches reflect the corrected
-- positions (junk rows from the broken era are replaced wholesale):
--
--   POST /api/admin/exact-match/audio-samples/matches   (empty body)

BEGIN;

UPDATE store__track_preview_fingerprint f
   SET store__track_preview_fingerprint_position
       = store__track_preview_fingerprint_position / 23.222
 WHERE f.store__track_preview_id IN (
   SELECT store__track_preview_id
   FROM store__track_preview_fingerprint_meta
   WHERE store__track_preview_fingerprint_extracted_at < '2026-02-01'
 );

UPDATE user_notification_audio_sample_fingerprint f
   SET user_notification_audio_sample_fingerprint_position
       = user_notification_audio_sample_fingerprint_position / 23.222
 WHERE f.user_notification_audio_sample_id IN (
   SELECT user_notification_audio_sample_id
   FROM user_notification_audio_sample_fingerprint_meta
   WHERE user_notification_audio_sample_fingerprint_extracted_at < '2026-02-01'
 );

-- Sanity-check: max positions should now be bounded by real durations.
-- Previews are ≤ ~2 min excerpts (Bandcamp full tracks can reach ~600 s);
-- samples are short recordings or uploaded tracks (≤ ~600 s). If either
-- side still reports max_position > 600, abort and review before COMMIT.
SELECT
  'preview' AS side,
  MAX(store__track_preview_fingerprint_position) AS max_position
FROM store__track_preview_fingerprint
UNION ALL
SELECT
  'sample' AS side,
  MAX(user_notification_audio_sample_fingerprint_position) AS max_position
FROM user_notification_audio_sample_fingerprint;

COMMIT;
