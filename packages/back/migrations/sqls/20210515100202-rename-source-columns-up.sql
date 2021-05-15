ALTER TABLE store__track
  RENAME COLUMN source_id TO store__track_source;

ALTER TABLE store__artist
  RENAME COLUMN source_id TO store__artist_source;

ALTER TABLE store__label
  RENAME COLUMN source_id TO store__label_source;

ALTER TABLE track
  RENAME COLUMN source_id TO track_source;

ALTER TABLE artist
  RENAME COLUMN source_id TO artist_source;

ALTER TABLE label
  RENAME COLUMN source_id TO label_source;

ALTER TABLE user__track
  RENAME COLUMN source_id TO user__track_source;

ALTER TABLE store__track_preview_waveform
  RENAME COLUMN source_id TO store__track_preview_waveform_source;

ALTER TABLE store__track_preview
  RENAME COLUMN source_id TO store__track_preview_source;

ALTER TABLE release
  RENAME COLUMN source_id TO release_source;

ALTER TABLE store__release
  RENAME COLUMN source_id TO store__release_source;

ALTER TABLE track__key
  RENAME COLUMN source_id TO track__key_source;

