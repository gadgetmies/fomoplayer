-- Sort-column indexes backing the track search in routes/shared/db/search.js.
--
-- searchForTracks() resolves a page of track ids with a join across the catalog
-- followed by `ORDER BY <sort column> ... LIMIT <n>`. The sortable columns come
-- from the aliasToColumn map in search.js:
--   released  -> store__track.store__track_released   (default sort, -released)
--   published -> store__track.store__track_published
--   added     -> track.track_added                    (also used by the addedSince filter)
-- None of these columns were indexed, so the page query degraded to a full scan
-- + sort that grows with the catalog. DESC ordering matches the default
-- `-released` sort and the descending sorts the UI requests; PostgreSQL can also
-- scan a DESC btree backwards for the ASC case.
--
-- IF NOT EXISTS keeps the migration idempotent: an interrupted deploy can leave
-- an index present in the database while the migrations row is never recorded
-- (e.g. the build connection dropped after the index committed). Because these
-- are plain, transactional CREATE INDEX statements, any index that survives by
-- one of these names is a complete, valid one, so re-running is a no-op rather
-- than a hard failure on the duplicate relation name.
--
-- Note: a non-CONCURRENT build takes a SHARE lock that blocks writes to the
-- target table for the duration of the build (consistent with the rest of this
-- migration set, e.g. the HNSW embedding index). On a large store__track this
-- can be a noticeable window; build CONCURRENTLY out of band first if that
-- write pause is unacceptable in production.
CREATE INDEX IF NOT EXISTS idx_store__track_store__track_released
  ON store__track (store__track_released DESC)
;

CREATE INDEX IF NOT EXISTS idx_store__track_store__track_published
  ON store__track (store__track_published DESC)
;

CREATE INDEX IF NOT EXISTS idx_track_track_added
  ON track (track_added DESC)
;
