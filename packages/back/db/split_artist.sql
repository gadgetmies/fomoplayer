SELECT artist_id
FROM
  store__artist
WHERE store__artist_store_id = PREVIOUS_ARTIST_STORE_ID
;

INSERT INTO artist (artist_name)
VALUES (NEW_ARTIST_NAME)
RETURNING artist_id
;

UPDATE track__artist
SET artist_id = INSERTED_ARTIST_ID
WHERE track_id IN (SELECT DISTINCT track_id
                   FROM
                     store__track
                   , JSONB_TO_RECORDSET(store__track.store__track_store_details -> 'artists') AS artist(name TEXT, id TEXT, url TEXT)
                   WHERE artist.id = ARTIST_STORE_ID)
  AND artist_id = PREVIOUS_ARTIST_ID
;

INSERT INTO track_details (track_id, track_details_updated, track_details)
  (SELECT track_id, NOW(), ROW_TO_JSON(track_details(ARRAY_AGG(track_id)))
   FROM
     track
     NATURAL LEFT JOIN track_details
   WHERE track_id IN (SELECT track_id
                      FROM
                        track
                        NATURAL JOIN track__artist
                      WHERE artist_id = INSERTED_ARTIST_ID)
   GROUP BY 1)
ON CONFLICT ON CONSTRAINT track_details_track_id_key DO UPDATE
  SET track_details         = EXCLUDED.track_details
    , track_details_updated = NOW()
;