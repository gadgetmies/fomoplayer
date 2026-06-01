-- Approximate-nearest-neighbour index backing the similarity search in
-- routes/shared/db/search.js, which sorts by cosine distance
--   store__track_preview_embedding <=> reference_embedding
-- HNSW gives sub-linear ORDER BY ... <=> ... scans and matches the cosine
-- operator class (vector_cosine_ops) used by <=>. A full (non-partial) index
-- is used so the planner can always satisfy the ordering, even when the
-- embedding_type filter is supplied as a bind parameter.
CREATE INDEX idx_store__track_preview_embedding_hnsw_cosine
  ON store__track_preview_embedding
  USING hnsw (store__track_preview_embedding vector_cosine_ops)
;
