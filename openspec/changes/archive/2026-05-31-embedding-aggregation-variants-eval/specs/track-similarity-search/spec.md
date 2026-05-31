## ADDED Requirements

### Requirement: Cosine-ranked similarity search

The similarity search triggered by a `track:~<id>` token SHALL rank candidate tracks by cosine distance between preview embeddings, using pgvector's cosine operator (`<=>`), not Euclidean distance.

#### Scenario: Results ordered by cosine distance

- **WHEN** a user searches `track:~<id>` for a track that has a stored preview embedding
- **THEN** returned tracks are ordered ascending by the minimum cosine distance between their preview embeddings and the reference track's embedding
- **AND** tracks with no embedding sort last

### Requirement: Embedding-type filtering

The similarity search SHALL compare only embeddings of the same embedding type, and SHALL select the reference embedding deterministically by filtering on `store__track_preview_embedding_type`.

#### Scenario: Reference and candidates share one type

- **WHEN** the similarity search builds its reference and candidate sets
- **THEN** both are restricted to embeddings whose `store__track_preview_embedding_type` equals the production type (`discogs_multi_embeddings-effnet-bs64-1`)
- **AND** vectors of a different embedding type are never compared against the reference

### Requirement: Temporary variant selector token

The search SHALL accept a temporary `variant:<name>` token alongside `track:~<id>` that makes the similarity search read embeddings from the variant eval table for the named variant instead of the production embedding table. When the token is absent, the production search path SHALL be unchanged.

#### Scenario: Variant token selects an eval embedding set

- **WHEN** a user searches `track:~<id> variant:trimmed_mean`
- **THEN** the reference and candidate embeddings are read from `store__track_preview_embedding_variant` where the variant name is `trimmed_mean`
- **AND** ranking still uses cosine distance

#### Scenario: Absent token uses production path

- **WHEN** a user searches `track:~<id>` with no `variant:` token
- **THEN** the search reads from `store__track_preview_embedding` exactly as the production path does

#### Scenario: Variant token is inert for non-similarity queries

- **WHEN** a query contains `variant:<name>` but no `track:~<id>`
- **THEN** the `variant:` token does not affect text matching or filtering and is not treated as a field filter

### Requirement: Production ANN index (deferred)

After the evaluation concludes, the production `store__track_preview_embedding` column SHALL have an HNSW index whose operator class matches the cosine search operator.

#### Scenario: Index supports cosine queries

- **WHEN** the deferred index migration has been applied
- **THEN** an HNSW index using `vector_cosine_ops` exists on `store__track_preview_embedding`
- **AND** the cosine similarity query can use it
