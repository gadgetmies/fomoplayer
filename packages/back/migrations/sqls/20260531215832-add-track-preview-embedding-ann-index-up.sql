-- Approximate-nearest-neighbour index backing the similarity search in
-- routes/shared/db/search.js, which sorts by cosine distance
--   store__track_preview_embedding <=> reference_embedding
-- HNSW gives sub-linear ORDER BY ... <=> ... scans and matches the cosine
-- operator class (vector_cosine_ops) used by <=>. A full (non-partial) index
-- is used so the planner can always satisfy the ordering, even when the
-- embedding_type filter is supplied as a bind parameter.
--
-- IF NOT EXISTS keeps the migration idempotent: an interrupted deploy can leave
-- the index present in the database while the migrations row is never recorded
-- (e.g. the build connection dropped after the index committed). Because this is
-- a plain, transactional CREATE INDEX, any index that survives by this name is a
-- complete, valid one, so re-running should be a no-op rather than a hard failure
-- on the duplicate relation name.
CREATE INDEX IF NOT EXISTS idx_store__track_preview_embedding_hnsw_cosine
  ON store__track_preview_embedding
  USING hnsw (store__track_preview_embedding vector_cosine_ops)
;
