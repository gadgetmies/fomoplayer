SELECT track_id, store__track_id, store__track_preview.*
FROM
  store__track_preview
  NATURAL JOIN store__track
WHERE store__track_preview_missing
;