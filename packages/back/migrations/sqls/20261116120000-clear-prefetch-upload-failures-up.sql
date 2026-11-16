-- The first prefetchPreviewAudio runs (2026-11-16) streamed each download to the
-- storage client without a size; the client then used a multipart upload whose
-- completion it could not parse, and every upload failed with "BUG: failed to
-- parse server response". Those failures were the job's, not the stores': undo
-- the missing marks the job set after three of them, and clear the failures so
-- the previews are downloaded again.
UPDATE store__track_preview p
SET store__track_preview_missing = FALSE
FROM store__track_preview_audio a
WHERE a.store__track_preview_id = p.store__track_preview_id
  AND a.store__track_preview_audio_object_key IS NULL
  AND a.store__track_preview_audio_last_error = 'BUG: failed to parse server response'
  AND a.store__track_preview_audio_failed_attempts >= 3
  AND p.store__track_preview_missing;

DELETE FROM store__track_preview_audio
WHERE store__track_preview_audio_object_key IS NULL
  AND store__track_preview_audio_last_error = 'BUG: failed to parse server response';
