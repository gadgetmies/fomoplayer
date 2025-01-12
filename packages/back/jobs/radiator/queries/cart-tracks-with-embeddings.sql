SELECT COUNT(
    CASE
      WHEN store__track_preview_embedding IS NOT NULL
        THEN 1
    END)        AS embeddings
     , COUNT(*) AS cart_tracks
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store__track_preview
  NATURAL LEFT JOIN store__track_preview_embedding
  NATURAL JOIN track__cart
;