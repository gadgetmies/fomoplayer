SELECT store_name, COUNT(track_id)
FROM
  track
  NATURAL JOIN store__track
  NATURAL JOIN store
WHERE track_added > NOW() - INTERVAL '1 days'
GROUP BY store_name
;