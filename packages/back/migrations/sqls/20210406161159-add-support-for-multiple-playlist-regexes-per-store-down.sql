ALTER TABLE store
    ADD COLUMN store_playlist_regex TEXT;

UPDATE store s
SET store_playlist_regex = (SELECT store_playlist_type_regex
                            FROM store_playlist_type spt
                            WHERE s.store_id = spt.store_id
                            ORDER BY spt.store_playlist_type_id
                            LIMIT 1);

ALTER TABLE store
    ALTER COLUMN store_playlist_regex SET NOT NULL;

ALTER TABLE playlist
    ADD COLUMN store_id INTEGER REFERENCES store (store_id);

UPDATE playlist p
SET store_id = (SELECT store_id
                FROM store_playlist_type spt
                WHERE p.store_playlist_type_id = spt.store_playlist_type_id);

ALTER TABLE playlist
    ALTER COLUMN store_id SET NOT NULL;
ALTER TABLE playlist
    DROP COLUMN store_playlist_type_id;

DROP TABLE store_playlist_type;
