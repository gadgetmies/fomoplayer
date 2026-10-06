## 1. Grouping maths

- [x] 1.1 Add `packages/back/routes/shared/cart-similarity/grouping.js` with vector helpers (mean, centre, normalise, dot)
- [x] 1.2 Implement nearest-neighbour-chain Ward linkage and `cutTree(linkage, n, k)`
- [x] 1.3 Implement silhouette, `maxK` and automatic `k` selection (groups ≥ 3 tracks)
- [x] 1.4 Implement leave-one-out similarities, Fit, closer-than percentage and next-best group
- [x] 1.5 Implement PCA-to-2D projection for the map
- [x] 1.6 Unit tests for grouping, auto k, Fit maths and projection

## 2. Database access

- [x] 2.1 Add `packages/back/routes/shared/db/cart-similarity.js`: resolve the user's cart by uuid, load member mean embeddings (latest 600), and the user's collection mean
- [x] 2.2 Candidate pool per group via HNSW (`SET LOCAL hnsw.ef_search`), with heard / ignored / purchased / cart-member / new-artists exclusions and exclusion counts
- [x] 2.3 Load `track_details` rows (with heard and carts) for the final result ids

## 3. Search orchestration and API

- [x] 3.1 Add `packages/back/routes/shared/cart-similarity/index.js`: groups → push-away from misses → scoring → top N per group → map coordinates
- [x] 3.2 Add `GET /api/me/carts/:uuid/similar` (k, newOnly, misses, limit) with 404 for unknown or foreign carts
- [x] 3.3 Delegate `cart:~<uuid>` in `searchForTracks` to the cart search
- [x] 3.4 API integration test: groups, automatic k, exclusions, push-away, 404, search-term delegation

## 4. Frontend

- [x] 4.1 Parse and serialise `cart:~<uuid>` in `searchTerms.js`; show the cart pill label in `GlobalSearchBar.js`; unit tests
- [x] 4.2 Route cart searches in `App.search` to the new API and keep cart search state (k, newOnly, misses, chip, map)
- [x] 4.3 Add `CartSearchControls` (controls row, Not this list, group chips, Save group as cart, map) and its CSS
- [x] 4.4 Render the Fit pill with tooltip and the Not this column in `Track.js` / `Tracks.js` for cart search rows
- [x] 4.5 Add the "Find similar" button to the cart view header
- [x] 4.6 Implement Save group as cart (create cart, add the group's tracks, refresh carts)

## 5. Demo tests and verification

- [x] 5.1 Add API-only seeding (tracks, synthetic embeddings via `POST /api/admin/analyse`, cart) in `test/lib/cart-similarity-seed.js`
- [x] 5.2 Add shared steps `test/lib/cart-similarity-steps.js` and the `cart-similarity-local.js` / `cart-similarity-preview.js` entry files
- [x] 5.3 Run the backend tests and the local demo test; fix failures

## 6. Refinements after the first review

- [x] 6.1 Run the cart search through `GET /api/tracks?q=cart:~<uuid>` (groups and map in `meta.cartSearch`); drop `/api/me/carts/:uuid/similar`
- [x] 6.2 Filter the cart search with the other search terms, `store` and `addedSince`
- [x] 6.3 Use only the 300 most recently added analysed cart tracks and report `cartTracks`; show the limit in the UI
- [x] 6.4 Keep the Purchased cart under the 25 s response timeout (newest-first loading, parallel queries, primary-key track lookup, smaller pool, background collection mean)
- [x] 6.5 UI: settings-style tabs for the groups, search spinner, opaque Not this button, clear the search bar on Find similar, ignore superseded search responses
- [x] 6.6 Return every track search as `{ tracks, meta: { total, offset, limit, count } }` (cart searches add `meta.cartSearch`); count the matches alongside the page query
- [x] 6.7 Align the Fit pill with the row's buttons
