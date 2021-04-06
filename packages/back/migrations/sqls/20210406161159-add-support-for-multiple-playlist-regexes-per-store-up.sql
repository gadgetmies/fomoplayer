CREATE TABLE store_playlist_type
(
    store_playlist_type_id       SERIAL PRIMARY KEY,
    store_id                     INTEGER REFERENCES store NOT NULL,
    store_playlist_type_regex    TEXT                     NOT NULL,
    store_playlist_type_store_id TEXT,
    store_playlist_type_label    TEXT,
    UNIQUE(store_id, store_playlist_type_regex),
    UNIQUE(store_id, store_playlist_type_store_id),
    UNIQUE(store_id, store_playlist_type_label)
    -- TODO: Add gist to make sure the different playlist types for a single store can be differentiated
);

INSERT INTO store_playlist_type (store_id, store_playlist_type_regex)
SELECT store_id, store_playlist_regex
FROM store;

ALTER TABLE store
    DROP COLUMN store_playlist_regex;

ALTER TABLE playlist
    ADD COLUMN store_playlist_type_id INTEGER REFERENCES store_playlist_type (store_playlist_type_id);

UPDATE playlist p
SET store_playlist_type_id = (SELECT store_playlist_type_id
                              FROM store_playlist_type spt
                              WHERE p.store_id = spt.store_id);

ALTER TABLE playlist
    DROP COLUMN store_id;
