## ADDED Requirements

### Requirement: Cart tracks are grouped by audio similarity

The cart search SHALL group the searched cart's tracks that have a `discogs_multi_embeddings-effnet-bs64-1`
embedding. Each track is represented by the mean of its preview embeddings, centred on the mean embedding of all
tracks in the user's carts and scaled to unit length. Groups SHALL be the clusters of a Ward hierarchical clustering
of those vectors cut into `k` clusters. At most the 600 most recently added embedded cart tracks SHALL be used.

#### Scenario: Two separable styles form two groups
- **WHEN** a cart contains three tracks whose embeddings are close to vector A and three close to a distant vector B, and the search runs with `k=2`
- **THEN** the response contains two groups, one with the three A tracks and one with the three B tracks

#### Scenario: Cart with too few embedded tracks
- **WHEN** the cart has fewer than two tracks with embeddings
- **THEN** the response is 200 with no groups, no tracks and a `reason` explaining that the cart has too few analysed tracks

### Requirement: Group count defaults to the best-separated split

When `k` is not given, the cart search SHALL choose `k` automatically as the value in 2…`maxK` with the highest mean
silhouette whose groups all have at least three tracks, falling back to 1. `maxK` SHALL be `min(8, ⌊n / 3⌋)` (at
least 1) where `n` is the number of grouped tracks. A requested `k` SHALL be clamped to 1…`maxK`. The response SHALL
report `k`, `autoK` and `maxK`.

#### Scenario: Automatic split
- **WHEN** the search runs without `k` on a cart with two clearly separated styles of three tracks each
- **THEN** `autoK` is 2 and `k` is 2

#### Scenario: Requested k is clamped
- **WHEN** the search runs with `k=50` on a cart whose `maxK` is 2
- **THEN** the response uses `k = 2`

### Requirement: Each group is searched separately with session push-away

For each group the cart search SHALL retrieve catalogue candidates through the preview embedding HNSW index and
score every candidate by centred cosine similarity to every group's centroid. A candidate SHALL belong to the group
it is most similar to. When `misses` (track ids) are given, each miss SHALL be assigned to its most similar group
and that group's centroid SHALL be replaced by `centroid − 0.5 · mean(misses in the group)` before scoring.
Misses SHALL NOT be persisted on the server, and miss tracks SHALL be excluded from the results.

#### Scenario: Push-away lowers results similar to a miss
- **WHEN** the same search is repeated with one result passed as a miss
- **THEN** the miss is not in the results and results similar to the miss rank lower than before

#### Scenario: Misses are not stored
- **WHEN** a search with misses completes
- **THEN** no database row records the misses

### Requirement: Results are scored with a comparable Fit value

Each result SHALL carry `cartSearch.fit`, an integer 0–100 computed as
`clamp(round(100 − 50 · (1 − s) / (1 − m)), 0, 100)`, where `s` is the result's similarity to its group's centroid
and `m` is the median leave-one-out similarity of the group's own tracks to the group centroid. Each result SHALL
also carry `group`, `similarity`, `closerThan` (the percentage of the group's tracks whose leave-one-out similarity
is lower than `s`), `nextGroup` and `nextFit` (the second-best group, when there is more than one group), and 2D map
coordinates `x`, `y`.

#### Scenario: A result at a typical cart-track distance
- **WHEN** a result's similarity equals the group's median leave-one-out similarity
- **THEN** its Fit is 50

### Requirement: Known tracks are excluded from results

The cart search SHALL NOT return tracks that are in the searched cart, that the user has heard, that are in the
user's purchased cart, or that match any of the user's artist, label, release or artist-on-label ignores. With
`newOnly=true` it SHALL also exclude tracks by artists the user follows or has tracks from in the purchased cart.
The response SHALL report how many retrieved candidates were excluded as heard, ignored and purchased.

#### Scenario: Heard and ignored tracks are left out
- **WHEN** the nearest catalogue track to a group has been heard by the user, and the next nearest is by an ignored artist
- **THEN** neither appears in the results and `excluded.heard` and `excluded.ignored` are at least 1

#### Scenario: New artists only
- **WHEN** the search runs with `newOnly=true`
- **THEN** no result has an artist the user follows

### Requirement: Cart search API

`GET /api/me/carts/:uuid/similar` SHALL run the cart search for the authenticated user's cart identified by its
uuid, accepting `k`, `newOnly`, `misses` (comma-separated track ids) and `limit` (results per group, default 50,
maximum 100). It SHALL return `{ cart, k, autoK, maxK, groups, tracks, map, excluded }` where `tracks` are
`track_details` rows with `cartSearch`, ordered by Fit. A cart that does not exist or belongs to another user SHALL
return 404.

#### Scenario: Another user's cart
- **WHEN** a user requests the similar tracks of a cart owned by someone else
- **THEN** the response is 404

### Requirement: cart search term on the track search

`GET /api/tracks?q=cart:~<uuid>` SHALL return the cart search results for the user's cart at the automatic group
count as a flat track list ordered by Fit, each track including `cartSearch`.

#### Scenario: Search term delegates to the cart search
- **WHEN** the track search is called with `q=cart:~<uuid of the user's cart>`
- **THEN** it returns the same tracks as the cart search API with default parameters
