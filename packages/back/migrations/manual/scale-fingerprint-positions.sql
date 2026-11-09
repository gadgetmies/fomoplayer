-- scale-fingerprint-positions.sql
--
-- One-shot operator migration. Run exactly once, after deploying the
-- analyser change that pins `blocks_to_seconds(t1)` to
-- `t1 * (128 / 16000)` (PANAKO_TRANSF_TIME_RESOLUTION / PANAKO_SAMPLE_RATE).
--
-- Background
-- ----------
-- Prior to fix-sample-matching, `analyser/panako_processor.py` computed
-- fingerprint positions as `t1 * (2048 / 11025)` ≈ 0.1857 s per block,
-- using outdated Panako defaults. The actual Panako 2.1 config (see
-- ~/.panako/config.properties) uses `128 / 16000 = 0.008` s per block —
-- a factor of (2048/11025) / (128/16000) = 23.222 too large.
--
-- All preview and sample fingerprint rows written before the fix have
-- `*_position` values inflated by exactly 23.222×. Because the matcher
-- pre-fix ignored positions entirely, the rows are usable as-is for
-- hash-based matching, but Stage 2 temporal-coherence rescoring would
-- mis-bucket Δt by the same factor.
--
-- Effect of this script
-- ---------------------
-- Divides every stored position by 23.222, in place. The constant
-- 23.222 = (2048 / 11025) / (128 / 16000) is exact to 4 decimals; the
-- residual rounding error is < 0.001 s per stored position and well
-- under the smallest sensible Δt bucket (~0.05 s).
--
-- Idempotency
-- -----------
-- This script is NOT idempotent. Running it twice halves positions a
-- second time and breaks Stage 2 matching. Track its execution in your
-- ops log; the column types (FLOAT) carry no marker to detect prior
-- application.
--
-- Rollback
-- --------
-- Multiply positions by 23.222 to invert. Practically: only run this
-- after you've verified the new analyser is the only writer producing
-- new rows.

BEGIN;

UPDATE store__track_preview_fingerprint
   SET store__track_preview_fingerprint_position
       = store__track_preview_fingerprint_position / 23.222;

UPDATE user_notification_audio_sample_fingerprint
   SET user_notification_audio_sample_fingerprint_position
       = user_notification_audio_sample_fingerprint_position / 23.222;

-- Sanity-check: the largest stored position should not exceed any
-- track's real duration. Inspect the result; if any row reports
-- max_position > 600 (10 minutes — beyond any sensible Panako-indexed
-- file), abort and review.
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
