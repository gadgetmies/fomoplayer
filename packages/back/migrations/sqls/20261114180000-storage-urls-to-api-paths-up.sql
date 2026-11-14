-- Object storage moved from a public MinIO server to a private bucket that the
-- API serves through presigned redirects at /api/storage/<object key>. Rewrite
-- the absolute MinIO URLs (http(s)://<host>/<bucket>/<object key>) to that
-- path, which does not depend on the storage host or the deployment's domain.
-- Object keys are unchanged by the move. Store-provided URLs never contain
-- these bucket paths and are left alone.

-- Audio samples carry their own bucket and object key.
UPDATE user_notification_audio_sample
SET user_notification_audio_sample_url = '/api/storage/' || user_notification_audio_sample_object_key
WHERE user_notification_audio_sample_url ~ '^https?://[^/]+/'
  AND user_notification_audio_sample_url LIKE
      '%/' || user_notification_audio_sample_bucket_name || '/' || user_notification_audio_sample_object_key;

-- Generated waveforms (and any previews) lived in the fomo-player-waveforms bucket.
UPDATE store__track_preview_waveform
SET store__track_preview_waveform_url =
      REGEXP_REPLACE(store__track_preview_waveform_url, '^https?://[^/]+/fomo-player-waveforms/', '/api/storage/')
WHERE store__track_preview_waveform_url ~ '^https?://[^/]+/fomo-player-waveforms/';

UPDATE store__track_preview
SET store__track_preview_url =
      REGEXP_REPLACE(store__track_preview_url, '^https?://[^/]+/fomo-player-waveforms/', '/api/storage/')
WHERE store__track_preview_url ~ '^https?://[^/]+/fomo-player-waveforms/';
