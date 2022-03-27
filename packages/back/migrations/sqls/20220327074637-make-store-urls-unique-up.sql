ALTER TABLE store__label
    ADD UNIQUE (store__label_url);
ALTER TABLE store__label
    ALTER COLUMN store__label_url SET NOT NULL;

ALTER TABLE store__artist
    ADD UNIQUE (store__artist_url);

-- TODO: (some?) Bandcamp artist urls are null
-- ALTER TABLE store__artist
--    ALTER COLUMN store__artist_url SET NOT NULL;

ALTER TABLE store__release
    ADD UNIQUE (store__release_url);
ALTER TABLE store__release
    ALTER COLUMN store__release_url SET NOT NULL;

ALTER TABLE store__track
    ADD UNIQUE (store__track_url);
-- Bandcamp tracks do not have urls -> cannot be set to not null