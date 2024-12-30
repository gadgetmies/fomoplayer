CREATE EXTENSION IF NOT EXISTS vector
;

CREATE TYPE EMBEDDING_TYPE AS ENUM ('discogs_artist_embeddings-effnet-bs64-1', 'discogs_multi_embeddings-effnet-bs64-1')
;

CREATE TABLE store__track_preview_embedding
(
  store__track_preview_id                   BIGINT REFERENCES store__track_preview (store__track_preview_id),
  store__track_preview_embedding            VECTOR(1280)   NOT NULL,
  store__track_preview_embedding_type       EMBEDDING_TYPE NOT NULL,
  store__track_preview_embedding_updated_at TIMESTAMPTZ    NOT NULL DEFAULT NOW(),
  UNIQUE (store__track_preview_id, store__track_preview_embedding_type)
)
;