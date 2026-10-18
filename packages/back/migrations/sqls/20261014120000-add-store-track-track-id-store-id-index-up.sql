-- Covering index for the user track list (queryUserTracks in routes/users/db.js).
--
-- The list query restricts the user's tracks to the selected stores by looking
-- each track up in store__track and needs only track_id and store_id from it.
-- store__track rows are wide (store__track_store_details holds the store's raw
-- track JSON, ~1.8 kB on average and below the TOAST threshold, so it is stored
-- inline), and a heavy user's tracks are spread over most of the table's pages.
-- Looking them up through idx_store__track_track_id meant a heap page read per
-- track; with this index the lookup is an index-only scan.
--
-- In production this index was first built with CREATE INDEX CONCURRENTLY out
-- of band, so IF NOT EXISTS makes this a no-op there; elsewhere the plain build
-- briefly blocks writes to store__track (see 20260603120000).
CREATE INDEX IF NOT EXISTS idx_store__track_track_id_store_id
  ON store__track (track_id, store_id)
;
