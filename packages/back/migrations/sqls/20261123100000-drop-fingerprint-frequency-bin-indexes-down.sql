-- Rebuilding the preview index blocks writes to the fingerprint table for the
-- whole build (775M rows in production); there, build it with CREATE INDEX
-- CONCURRENTLY out of band first.
CREATE INDEX IF NOT EXISTS idx_store__track_preview_fingerprint_frequency_bin
  ON store__track_preview_fingerprint (store__track_preview_fingerprint_frequency_bin);
CREATE INDEX IF NOT EXISTS idx_user_notification_audio_sample_fingerprint_frequency_bin
  ON user_notification_audio_sample_fingerprint (user_notification_audio_sample_fingerprint_frequency_bin);
