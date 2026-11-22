## ADDED Requirements

### Requirement: Embeddings come from the shared track-embedding package
The analyser and the embedding service SHALL compute preview and sample embeddings with the pinned `track_embedding` reference package, SHALL pass its conformance fixtures, and SHALL NOT depend on Essentia or TensorFlow.

#### Scenario: Matches stored vectors
- **WHEN** the package embeds a preview that already holds a stored vector
- **THEN** the cosine similarity between the two is at least 0.99999

#### Scenario: Conformance fixtures
- **WHEN** the analyser test suite embeds every fixture of `track-embedding/1`
- **THEN** each vector has cosine similarity of at least 0.99999 with the fixture's reference vector
