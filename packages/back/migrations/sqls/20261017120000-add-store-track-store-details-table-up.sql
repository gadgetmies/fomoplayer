-- Move the store's raw track JSON out of store__track into its own table.
--
-- store__track_store_details averages ~1.8 kB, just under the TOAST threshold,
-- so it was stored inline and made store__track ~350 MB for ~200k rows. Every
-- query that only needs a store__track's ids or dates read those wide rows.
-- Nothing in the application reads the JSON; it is kept for reference and
-- ad-hoc queries.
--
-- The table follows track_details: its own serial key, a unique FK to the
-- parent, and the payload column named after the table, so
-- `store__track NATURAL JOIN store__track_store_details` gives back the old
-- column name.
--
-- This is the first of two steps. The column on store__track is only made
-- nullable here, because the previous deployment keeps writing it until the
-- new one is live. 20261017130000 copies any rows written in between and
-- drops the column.
CREATE TABLE store__track_store_details
(
  store__track_store_details_id SERIAL PRIMARY KEY,
  store__track_id               INTEGER NOT NULL UNIQUE REFERENCES store__track (store__track_id) ON DELETE CASCADE,
  store__track_store_details    JSONB   NOT NULL
)
;

INSERT INTO store__track_store_details (store__track_id, store__track_store_details)
SELECT store__track_id, store__track_store_details
FROM store__track
WHERE store__track_store_details IS NOT NULL
;

ALTER TABLE store__track
  ALTER COLUMN store__track_store_details DROP NOT NULL
;

GRANT SELECT ON store__track_store_details TO fomoplayer_query
;
