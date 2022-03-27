ALTER TABLE store__label
    DROP CONSTRAINT store__label_store__label_url_key;
ALTER TABLE store__label
    ALTER COLUMN store__label_url DROP NOT NULL;

ALTER TABLE store__artist
    DROP CONSTRAINT store__artist_store__artist_url_key;
ALTER TABLE store__artist
    ALTER COLUMN store__artist_url DROP NOT NULL;

ALTER TABLE store__release
    DROP CONSTRAINT store__release_store__release_url_key;
ALTER TABLE store__release
    ALTER COLUMN store__release_url DROP NOT NULL;

ALTER TABLE store__track
    ADD UNIQUE (store__track_url);
-- Bandcamp tracks do not have urls -> cannot be set to not null