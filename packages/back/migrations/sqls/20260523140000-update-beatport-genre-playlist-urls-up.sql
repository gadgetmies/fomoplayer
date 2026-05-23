-- Beatport's genre top-100 moved from the bare genre page
-- (https://www.beatport.com/genre/{slug}/{id}) to a dedicated /top-100 path
-- (https://www.beatport.com/genre/{slug}/{id}/top-100), which the v4 client maps
-- to /catalog/genres/{id}/top/100/. Canonicalise existing genre playlist follows
-- to the /top-100 form. Matches only bare genre URLs, so it is idempotent.
UPDATE playlist
SET playlist_store_id =
      regexp_replace(playlist_store_id, '^(https://www\.beatport\.com/genre/[^/]+/[0-9]+)/?$', '\1/top-100')
WHERE store_playlist_type_id IN (
  SELECT store_playlist_type_id
  FROM store_playlist_type spt
    JOIN store s ON s.store_id = spt.store_id
  WHERE s.store_name = 'Beatport'
)
  AND playlist_store_id ~ '^https://www\.beatport\.com/genre/[^/]+/[0-9]+/?$';
