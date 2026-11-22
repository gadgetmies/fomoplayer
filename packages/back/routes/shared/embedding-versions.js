'use strict'
// Stored embedding types and the shared track-embedding specification version each one is
// (github.com/gadgetmies/track-embedding, SPECIFICATION.md). The database keeps the type
// (`store__track_preview_embedding_type`); clients that hold their own vectors speak versions. A new model is a new
// version and a new type, and both may be stored side by side while previews are re-embedded. The analyser holds the
// same mapping (analyser/embedding.py, EMBEDDING_VERSIONS).
const EMBEDDING_VERSIONS = Object.freeze({
  'discogs_multi_embeddings-effnet-bs64-1': 'track-embedding/1',
})

const TYPE_BY_VERSION = Object.freeze(
  Object.fromEntries(Object.entries(EMBEDDING_VERSIONS).map(([type, version]) => [version, type])),
)

// Every version has this many numbers per vector.
const EMBEDDING_DIMENSIONS = 1280

module.exports = { EMBEDDING_VERSIONS, TYPE_BY_VERSION, EMBEDDING_DIMENSIONS }
