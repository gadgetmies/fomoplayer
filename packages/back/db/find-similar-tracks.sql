SELECT track_id, track_title
FROM
  store__track
  NATURAL JOIN store__track_preview
  NATURAL JOIN store__track_preview_embedding
  NATURAL JOIN track__artist
  NATURAL JOIN artist
  NATURAL JOIN track
WHERE artist_name = 'Samurai Breaks'
;

SELECT STRING_AGG(artist_name, ' ') || ' ' || track_title, track_id, cart_id
FROM
  store__track
  NATURAL JOIN store__track_preview
  NATURAL JOIN store__track_preview_embedding
  NATURAL JOIN track__artist
  NATURAL JOIN artist
  NATURAL JOIN track
  NATURAL LEFT JOIN track__cart
GROUP BY track_id, track_title, cart_id, store__track_preview_embedding
ORDER BY store__track_preview_embedding <->
         (SELECT store__track_preview_embedding
          FROM
            store__track_preview_embedding
            NATURAL JOIN store__track_preview
            NATURAL JOIN store__track
          WHERE track_id = 11024)
;
