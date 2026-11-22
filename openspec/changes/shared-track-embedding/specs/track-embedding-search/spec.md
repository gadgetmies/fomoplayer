## ADDED Requirements

### Requirement: Clients can list the indexed embedding versions
The back end SHALL answer `GET /api/embeddings/versions` with every track-embedding specification version it holds preview vectors of, with coverage and count, to an authenticated API-key client.

#### Scenario: Version 1 indexed
- **WHEN** an API-key client asks for the versions
- **THEN** the answer is `{ "versions": [{ "version": "track-embedding/1", "coverage": "preview", "count": <number of previews holding a vector of it> }] }`

### Requirement: Clients can search previews by their own vectors
The back end SHALL answer `POST /api/embeddings/similar-tracks` with body `{ "version", "coverage": "full" | "preview", "vectors": [1 to 50 arrays of 1280 numbers], "limit"?: 1–200, default 50 }` with tracks ranked by cosine distance between their preview vectors of the requested version and the nearest of the query vectors, at most `limit` tracks, leaving out the tracks the key's user has heard, ignores or bought (as the cart similarity search does), and SHALL store nothing from the request.

#### Scenario: Result shape
- **WHEN** a valid search finds tracks
- **THEN** the answer is `{ "version", "tracks": [...] }` nearest first, each track `{ "id", "url" (the track in the web app), "distance" (cosine), "similarity" (max(0, 1 − distance)), "queryIndex" (0-based nearest query vector), "title", "version", "artists": [{ "id", "name" }], "remixers": [{ "id", "name" }], "labels": [{ "id", "name" }], "releaseDate" ("YYYY-MM-DD" or null), "durationMs", "stores": [{ "name", "code", "url", "releaseUrl" }] }`

#### Scenario: Tracks the user does not want
- **WHEN** a track the user has heard, ignores or bought is among the nearest
- **THEN** it is not returned

#### Scenario: Ranking by the nearest query vector
- **WHEN** a client sends two query vectors
- **THEN** each track's distance is its smallest distance to either vector and tracks are returned in ascending distance

#### Scenario: Unsupported version
- **WHEN** a client sends a version this instance does not index
- **THEN** the answer is `409` with `{ "error": "embedding_version_unsupported", "message", "versions": [as the version listing] }`

#### Scenario: Malformed vector
- **WHEN** a query vector does not have 1280 finite numbers, or all of them are zero
- **THEN** the answer is `400` with `{ "error": "invalid_request", "message" }` and no query runs

#### Scenario: No API key
- **WHEN** the request carries no valid API key
- **THEN** the answer is `401`
