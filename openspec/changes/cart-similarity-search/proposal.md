## Why

Similarity search today starts from a single track (`track:~<id>`). DJs collect tracks in carts that hold
several related but distinct styles, and averaging a whole cart produces a vague search. Research on the user's
carts showed that splitting a cart into groups of similar tracks, searching each group separately and pushing the
search away from unwanted results gives noticeably more specific matches (removal AUC 0.71 → 0.76 with push-away;
collection-centred embeddings 0.65 → 0.69).

## What Changes

- New backend cart search: groups a cart's tracks (Ward clustering on Discogs-EffNet embeddings centred on the
  user's collection), searches the catalogue per group through the existing HNSW index, and scores each result
  with a Fit value (0–100) that is comparable across groups.
- New API `GET /api/me/carts/:uuid/similar` with a coarse ↔ fine group count (`k`, automatic by default),
  session-only "Not this" push-away (`misses`), and a New-artists-only filter (`newOnly`).
- Results always exclude tracks the user has heard, ignored (artist, label, release, artist on label), purchased,
  or already has in the searched cart.
- New search mode `cart:~<cart uuid>`; the existing `/api/tracks?q=` search delegates it to the cart search.
- New UI in the search results: controls row (slider, New artists only, Map toggle, counts), group chips,
  Fit pill per row with a details tooltip, a "Not this" column, a 2D map behind the Map toggle, and
  "Save group as cart".
- New "Find similar" action in the cart view.

## Capabilities

### New Capabilities
- `cart-similarity-search`: grouping of a cart's tracks, per-group catalogue search, push-away, Fit scoring,
  exclusions, the `/api/me/carts/:uuid/similar` API and the `cart:~<uuid>` search term on `/api/tracks`.
- `cart-similarity-search-ui`: the Find similar entry point, the results controls (slider, New artists only, Map),
  group chips, Fit pill and tooltip, "Not this" column and session misses, the map, and Save group as cart.

### Modified Capabilities

None.

## Impact

- Backend: new `packages/back/routes/shared/cart-similarity/` (grouping maths, orchestration),
  `packages/back/routes/shared/db/cart-similarity.js` (SQL), a route in `packages/back/routes/users/api.js`,
  and a delegation branch in `packages/back/routes/shared/db/search.js`.
- Frontend: `searchTerms.js`, `GlobalSearchBar.js`, `App.js` (search routing and state), `Tracks.js`, `Track.js`,
  a new `CartSearchControls.js` (+ CSS), and the cart header's Find similar button.
- Database: read-only use of `store__track_preview_embedding` (HNSW index), carts, follows, ignores and
  `user__track`; no schema changes.
- Tests: unit tests for the grouping maths and search terms, an API integration test, and paired demo tests.
