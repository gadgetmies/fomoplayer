-- The frequency-bin indexes added with the f1 column (20260125190446) have no
-- reader: no query filters or joins on the frequency bin, and production
-- recorded no scan of either since its 2026-10-28 restart. The preview one
-- (5.3 GB) is updated on every fingerprint upload, the analyser's bottleneck.
-- The columns stay.
--
-- In production both were dropped with DROP INDEX CONCURRENTLY out of band on
-- 2026-11-23, so IF EXISTS makes this a no-op there.
DROP INDEX IF EXISTS idx_store__track_preview_fingerprint_frequency_bin;
DROP INDEX IF EXISTS idx_user_notification_audio_sample_fingerprint_frequency_bin;
