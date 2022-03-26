UPDATE store
SET store_artist_regex = '^https:\/\/([^.]+)\.bandcamp\.com/'
WHERE store_name = 'Bandcamp';
UPDATE store
SET store_artist_regex = '^https:\/\/open\.spotify\.com\/artist\/([0-9A-Za-z]+)'
WHERE store_name = 'Spotify';