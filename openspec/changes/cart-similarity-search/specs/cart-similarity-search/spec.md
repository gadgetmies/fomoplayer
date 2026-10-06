## ADDED Requirements

### Requirement: Cart tracks are grouped by audio similarity

The cart search SHALL group the searched cart's tracks that have a `discogs_multi_embeddings-effnet-bs64-1`
embedding. Each track is represented by the mean of its preview embeddings, centred on the mean embedding of all
tracks in the user's carts and scaled to unit length. Groups SHALL be the clusters of a Ward hierarchical clustering
of those vectors cut into `k` clusters. Only the 300 most recently added embedded cart tracks SHALL be used, and the
response SHALL report `cartTracks: { total, analysed, used, limit }`.

#### Scenario: A large cart uses its newest tracks
- **WHEN** a cart has 3,648 tracks of which 3,256 are analysed
- **THEN** the groups are formed from the 300 most recently added analysed tracks and `cartTracks` is `{ total: 3648, analysed: 3256, used: 300, limit: 300 }`

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
`newArtistsOnly=true` it SHALL also exclude tracks by artists the user follows or has tracks from in the purchased cart.
The response SHALL report how many retrieved candidates were excluded as heard, ignored, purchased and (with
`newArtistsOnly`) by known artists.

#### Scenario: Heard and ignored tracks are left out
- **WHEN** the nearest catalogue track to a group has been heard by the user, and the next nearest is by an ignored artist
- **THEN** neither appears in the results and `excluded.heard` and `excluded.ignored` are at least 1

#### Scenario: New artists only
- **WHEN** the search runs with `newArtistsOnly=true`
- **THEN** no result has an artist the user follows

### Requirement: Cart search through the track search

The cart search SHALL run through the track search: `GET /api/tracks?q=cart:~<uuid>` for the authenticated user's
cart, accepting `k`, `newArtistsOnly`, `misses` (comma-separated track ids) and the usual `store` and `addedSince`
parameters. Like every track search it SHALL return `{ tracks, meta: { total, offset, limit, count } }`, with the
tracks ordered by Fit and each including `cartSearch`. `meta.cartSearch` SHALL be
`{ cart, cartTracks, limitPerGroup, k, autoK, maxK, groups, map, excluded }`, or null when the cart does not exist or
belongs to another user (then there are no tracks). All results are returned at once: `limit` is `limitPerGroup × k`
and an `offset` above 0 returns no tracks.

#### Scenario: Another user's cart
- **WHEN** a user searches with the uuid of a cart owned by someone else
- **THEN** the response is 200 with no tracks

#### Scenario: The page is reported in meta
- **WHEN** the track search is called with `q=cart:~<uuid of the user's cart with two groups>`
- **THEN** `meta` is `{ total: n, offset: 0, limit: 100, count: n }` where `n` is the number of tracks, and `meta.cartSearch.limitPerGroup` is 50

### Requirement: Track search responses report the page

Every track search (`GET /api/tracks?q=…`) SHALL return `{ tracks, meta: { total, offset, limit, count } }`: `total`
SHALL be the number of tracks matching the query, `offset` and `limit` the requested page, and `count` the number of
tracks returned.

#### Scenario: A later page
- **WHEN** a query matches 14 tracks and the search is called with `limit=5&offset=2`
- **THEN** `meta` is `{ total: 14, offset: 2, limit: 5, count: 5 }` and the tracks are the 3rd to 7th of the full result

### Requirement: Other search terms filter the cart search

The cart search SHALL filter its results by the other terms of the query (free text, `artist:`, `label:`,
`release:`, `track:`, `genre:`, `key:`, `bpm:`) and by the `store` and `addedSince` parameters. With an artist, label, release, track,
genre, key or bpm term matching at most 2,000 tracks, every matching track SHALL be scored; otherwise the nearest
tracks SHALL be retrieved as usual and filtered by the terms.

#### Scenario: Free text narrows the results
- **WHEN** the query is `cart:~<uuid> nearA1` and a track titled `nearA1` is among the nearest tracks
- **THEN** it is the only result, and the groups are the same as without the text

#### Scenario: An artist term finds the artist's tracks
- **WHEN** the query is `cart:~<uuid> artist:<id>`
- **THEN** the results are that artist's tracks, scored against the cart's groups
