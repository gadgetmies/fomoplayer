UPDATE store__track
SET store__track_store_details = store__track_store_details.store__track_store_details
FROM store__track_store_details
WHERE store__track.store__track_id = store__track_store_details.store__track_id
  AND store__track.store__track_store_details IS NULL
;

UPDATE store__track
SET store__track_store_details = '{}'::JSONB
WHERE store__track_store_details IS NULL
;

ALTER TABLE store__track
  ALTER COLUMN store__track_store_details SET NOT NULL
;

DROP TABLE store__track_store_details
;
