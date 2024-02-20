ALTER TABLE store
  ADD COLUMN store_search_url TEXT
;

UPDATE store
SET store_search_url = 'https://www.beatport.com/search/tracks?q='
WHERE store_name = 'Beatport'
;

UPDATE store
SET store_search_url = 'https://bandcamp.com/search?q='
WHERE store_name = 'Bandcamp'
;

UPDATE store
SET store_search_url = 'https://open.spotify.com/search/'
WHERE store_name = 'Spotify'
;

ALTER TABLE store
  ALTER COLUMN store_search_url SET NOT NULL
;