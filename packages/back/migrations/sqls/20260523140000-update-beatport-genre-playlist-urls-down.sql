-- Revert the genre top-100 URLs back to the bare genre page form.
UPDATE playlist
SET playlist_store_id =
      regexp_replace(playlist_store_id, '^(https://www\.beatport\.com/genre/[^/]+/[0-9]+)/top-100/?$', '\1')
WHERE store_playlist_type_id IN (
  SELECT store_playlist_type_id
  FROM store_playlist_type spt
    JOIN store s ON s.store_id = spt.store_id
  WHERE s.store_name = 'Beatport'
)
  AND playlist_store_id ~ '^https://www\.beatport\.com/genre/[^/]+/[0-9]+/top-100/?$';
