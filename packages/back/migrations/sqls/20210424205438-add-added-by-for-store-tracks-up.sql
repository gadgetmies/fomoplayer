ALTER TABLE store__track
  ADD COLUMN store__track_source JSONB;
ALTER TABLE store__artist
  ADD COLUMN store__artist_source JSONB;
ALTER TABLE store__label
  ADD COLUMN store__label_source JSONB;
ALTER TABLE track
  ADD COLUMN track_source JSONB;
ALTER TABLE artist
  ADD COLUMN artist_source JSONB;
ALTER TABLE label
  ADD COLUMN label_source JSONB;
ALTER TABLE user__track
  ADD COLUMN user__track_source JSONB;
ALTER TABLE store__track_preview_waveform
  ADD COLUMN store__track_preview_waveform_source JSONB;
ALTER TABLE store__track_preview
  ADD COLUMN store__track_preview_source JSONB;
ALTER TABLE release
  ADD COLUMN release_source JSONB;
ALTER TABLE store__release
  ADD COLUMN store__release_source JSONB;
ALTER TABLE track__key
  ADD COLUMN track__key_source JSONB;
