-- Until now a download that could not connect at all (Node's fetch reports
-- "fetch failed") counted as a failed attempt, so prefetchPreviewAudio marked
-- previews missing after three of them, hiding them from playback, although an
-- unreachable host or a network outage is not the preview's fault. Such
-- failures no longer count: undo the missing marks the job set after three of
-- them, and clear the failures so the previews are downloaded again.
UPDATE store__track_preview p
SET store__track_preview_missing = FALSE
FROM store__track_preview_audio a
WHERE a.store__track_preview_id = p.store__track_preview_id
  AND a.store__track_preview_audio_object_key IS NULL
  AND a.store__track_preview_audio_last_error = 'fetch failed'
  AND a.store__track_preview_audio_failed_attempts >= 3
  AND p.store__track_preview_missing;

DELETE FROM store__track_preview_audio
WHERE store__track_preview_audio_object_key IS NULL
  AND store__track_preview_audio_last_error = 'fetch failed';
