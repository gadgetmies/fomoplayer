-- The audio of a preview, downloaded by the prefetchPreviewAudio job so the
-- analyser workers read it from the bucket instead of the store. The row is
-- deleted, and the object removed, once every analysis of the preview is done.
-- A row without an object key records failed download attempts.
CREATE TABLE store__track_preview_audio
(
  store__track_preview_id                    BIGINT PRIMARY KEY NOT NULL
    REFERENCES store__track_preview (store__track_preview_id) ON DELETE CASCADE,
  store__track_preview_audio_object_key      TEXT UNIQUE,
  store__track_preview_audio_file_size       BIGINT,
  store__track_preview_audio_stored_at       TIMESTAMPTZ,
  store__track_preview_audio_failed_attempts INTEGER     NOT NULL DEFAULT 0,
  store__track_preview_audio_last_error      TEXT,
  store__track_preview_audio_last_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO job (job_name, job_enabled) VALUES ('prefetchPreviewAudio', TRUE)
ON CONFLICT (job_name) DO UPDATE SET job_enabled = TRUE;
INSERT INTO job_schedule (job_id, job_schedule)
SELECT job_id, '*/10 * * * *'
FROM job
WHERE job_name = 'prefetchPreviewAudio'
ON CONFLICT (job_id) DO NOTHING;
