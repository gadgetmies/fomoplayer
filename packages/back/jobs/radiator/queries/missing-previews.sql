SELECT store_name, COUNT(*) AS missing_previews
FROM
  store__track_preview
  NATURAL JOIN store__track
  NATURAL JOIN store
WHERE store__track_preview_missing
GROUP BY store_name
;
