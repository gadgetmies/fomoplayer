ALTER TABLE store__track
  RENAME COLUMN store__track_source TO source_id;

ALTER TABLE store__artist
  RENAME COLUMN store__artist_source TO source_id;

ALTER TABLE store__label
  RENAME COLUMN store__label_source TO source_id;

ALTER TABLE track
  RENAME COLUMN track_source TO source_id;

ALTER TABLE artist
  RENAME COLUMN artist_source TO source_id;

ALTER TABLE label
  RENAME COLUMN label_source TO source_id;

ALTER TABLE user__track
  RENAME COLUMN user__track_source TO source_id;

ALTER TABLE store__track_preview_waveform
  RENAME COLUMN store__track_preview_waveform_source TO source_id;

ALTER TABLE store__track_preview
  RENAME COLUMN store__track_preview_source TO source_id;

ALTER TABLE release
  RENAME COLUMN release_source TO source_id;

ALTER TABLE store__release
  RENAME COLUMN store__release_source TO source_id;

ALTER TABLE track__key
  RENAME COLUMN track__key_source TO source_id;

