ALTER TABLE store__track
  ADD COLUMN store__track_store_details JSONB
;

UPDATE store__track
SET store__track_store_details = store__track_store_details.store__track_store_details
FROM store__track_store_details
WHERE store__track.store__track_id = store__track_store_details.store__track_id
;
