ALTER TABLE store__artist ADD COLUMN store__artist_ignored BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE store__artist ADD COLUMN store__artist_ignored_reason TEXT;
ALTER TABLE store__label ADD COLUMN store__label_ignored BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE store__label ADD COLUMN store__label_ignored_reason TEXT;
