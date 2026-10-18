-- Second step of moving the store's track JSON to store__track_store_details
-- (see 20261017120000). Deploy this only after the code that writes
-- store__track_store_details is live: the deployment before it still wrote
-- the store__track column.
--
-- Copy the details of store tracks the previous deployment added while the
-- first step was being deployed. Rows that already have details keep them:
-- those were written by the new code and are newer.
INSERT INTO store__track_store_details (store__track_id, store__track_store_details)
SELECT store__track_id, store__track_store_details
FROM store__track
WHERE store__track_store_details IS NOT NULL
ON CONFLICT (store__track_id) DO NOTHING
;

-- DROP COLUMN only marks the column dropped; the space is reclaimed when the
-- table is rewritten. In production run `VACUUM (FULL, ANALYZE) store__track`
-- by hand afterwards (it locks the table for the duration of the rewrite).
ALTER TABLE store__track
  DROP COLUMN store__track_store_details
;
