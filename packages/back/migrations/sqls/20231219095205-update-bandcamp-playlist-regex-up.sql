UPDATE store_playlist_type
SET store_playlist_type_regex = '^https:\/\/bandcamp.com\/discover\/(([^/?]+)\/?)?([^/?]*)?(\?tags=([^/?]+))?'
WHERE store_id = (SELECT store_id FROM store WHERE store_name = 'Bandcamp')
;