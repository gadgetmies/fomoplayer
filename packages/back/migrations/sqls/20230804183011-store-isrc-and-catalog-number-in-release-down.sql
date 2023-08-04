ALTER TABLE release DROP COLUMN release_isrc;
ALTER TABLE release DROP COLUMN release_catalog_number;
ALTER TABLE track ADD COLUMN track_isrc TEXT;