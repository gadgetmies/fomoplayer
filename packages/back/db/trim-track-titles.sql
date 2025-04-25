WITH updated_titles AS (SELECT DISTINCT track_id, TRIM(track_title) AS updated_title
                        FROM
                          track
                          NATURAL JOIN track__artist
                          NATURAL JOIN artist
                        WHERE TRIM(track_title) <> track_title)
   , updated_tracks AS (UPDATE track t
  SET track_title = (SELECT updated_title FROM updated_titles WHERE updated_titles.track_id = t.track_id)
  WHERE track_id IN (SELECT track_id FROM updated_titles WHERE updated_title <> '')
  RETURNING track_id)
UPDATE track_details
SET track_details_updated = NOW() - INTERVAL '1 years'
WHERE track_id IN (SELECT track_id FROM updated_tracks)
RETURNING track_id
;