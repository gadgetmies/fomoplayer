## ADDED Requirements

### Requirement: Clients can list the indexed embedding versions
The back end SHALL answer `GET /api/embeddings/versions` with every track-embedding specification version it holds preview vectors of, with coverage and count, to an authenticated API-key client.

#### Scenario: Version 1 indexed
- **WHEN** an API-key client asks for the versions
- **THEN** the answer lists `track-embedding/1` with coverage `preview` and the number of previews holding a vector of it

### Requirement: Clients can search previews by their own vectors
The back end SHALL answer `POST /api/embeddings/similar-tracks` with tracks ranked by cosine distance between their preview vectors of the requested version and the nearest of 1 to 50 query vectors, at most `limit` (≤ 200) tracks, and SHALL store nothing from the request.

#### Scenario: Ranking by the nearest query vector
- **WHEN** a client sends two query vectors
- **THEN** each track's distance is its smallest distance to either vector and tracks are returned in ascending distance

#### Scenario: Unsupported version
- **WHEN** a client sends a version this instance does not index
- **THEN** the answer is `409` with `embedding_version_unsupported` and the indexed versions

#### Scenario: Malformed vector
- **WHEN** a query vector does not have 1280 finite numbers
- **THEN** the answer is `400` and no query runs

#### Scenario: No API key
- **WHEN** the request carries no valid API key
- **THEN** the answer is `401`
