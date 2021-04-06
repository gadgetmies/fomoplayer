DELETE
FROM user__playlist_watch
WHERE playlist_id IN (
    SELECT playlist_id
    FROM playlist
             NATURAL JOIN store_playlist_type
             NATURAL JOIN store
    WHERE store_playlist_type_store_id = 'tag'
      AND store_name = 'Bandcamp');

DELETE
FROM playlist
WHERE store_playlist_type_id = (
    SELECT store_playlist_type_id
    FROM store_playlist_type
             NATURAL JOIN store
    WHERE store_playlist_type_store_id = 'tag'
      AND store_name = 'Bandcamp');

DELETE
FROM store_playlist_type
WHERE store_playlist_type_store_id = 'tag'
  AND store_id = (SELECT store_id FROM store WHERE store_name = 'Bandcamp');
