UPDATE store__artist
SET store__artist_ignored = TRUE
WHERE (SELECT store__artist_id
       FROM
         artist
         NATURAL JOIN store__artist
       WHERE store__artist_store_id = STORE_ARTIST_ID)
;