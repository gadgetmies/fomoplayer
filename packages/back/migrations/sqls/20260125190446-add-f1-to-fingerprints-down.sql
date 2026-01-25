-- Remove frequency_bin field from fingerprint tables

DROP INDEX IF EXISTS idx_user_notification_audio_sample_fingerprint_frequency_bin;
DROP INDEX IF EXISTS idx_store__track_preview_fingerprint_frequency_bin;

ALTER TABLE user_notification_audio_sample_fingerprint
  DROP COLUMN IF EXISTS user_notification_audio_sample_fingerprint_frequency_bin;

ALTER TABLE store__track_preview_fingerprint
  DROP COLUMN IF EXISTS store__track_preview_fingerprint_frequency_bin;

