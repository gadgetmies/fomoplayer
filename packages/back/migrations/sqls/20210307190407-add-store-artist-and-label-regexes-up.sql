ALTER TABLE store ADD COLUMN store_artist_regex TEXT;
ALTER TABLE store ADD COLUMN store_label_regex TEXT;
UPDATE store SET store_artist_regex = '^https:\/\/www\.beatport\.com\/artist\/[^/]*\/([^/]+)', store_label_regex = '^https:\/\/www\.beatport\.com\/label\/[^/]*\/([^/]+)' WHERE store_name = 'Beatport';
UPDATE store SET store_artist_regex = '^https:\/\/open\.spotify\.com\/artist\/([0-9A-Za-z]+)' WHERE store_name = 'Spotify';
UPDATE store SET store_artist_regex = '^https:\/\/([^.]+)\.bandcamp\.com/', store_label_regex = '^https:\/\/([^.]+)\.bandcamp\.com' WHERE store_name = 'Bandcamp';
