ALTER TABLE store__label ADD COLUMN store__label_missing BOOL NOT NULL DEFAULT FALSE;
ALTER TABLE store__artist ADD COLUMN store__artist_missing BOOL NOT NULL DEFAULT FALSE;
ALTER TABLE store__release ADD COLUMN store__release_missing BOOL NOT NULL DEFAULT FALSE;

