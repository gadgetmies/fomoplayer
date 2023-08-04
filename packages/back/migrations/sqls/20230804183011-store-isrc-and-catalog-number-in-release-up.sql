ALTER TABLE release ADD COLUMN release_isrc TEXT UNIQUE;
ALTER TABLE release ADD COLUMN release_catalog_number TEXT;
ALTER TABLE track DROP COLUMN track_isrc;