ALTER TABLE release__track ADD COLUMN release__track_track_number INTEGER;
ALTER TABLE release__track ADD UNIQUE (release_id, release__track_track_number);