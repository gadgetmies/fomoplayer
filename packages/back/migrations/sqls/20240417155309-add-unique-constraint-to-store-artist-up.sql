DELETE
FROM
  store__artist
WHERE store__artist_id NOT IN (SELECT MIN(store__artist_id) FROM store__artist GROUP BY artist_id, store_id)
;

ALTER TABLE store__artist
  ADD UNIQUE (store_id, artist_id)
;