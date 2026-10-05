# Cart similarity search — design

Date: 2026-10-06
Status: approved (UI approved in the Lavish mockup review on 2026-10-06; the user asked to proceed straight to OpenSpec and implementation)

## Goal

Let a user search the catalogue for tracks that sound like a **cart**, not just like a single track. Real carts
contain several related but distinct styles. Averaging the whole cart gives a vague search, so the cart is split
into **groups** of similar tracks and each group is searched on its own. The user picks how coarse or fine the
split is, can focus on one group, can push the search away from results they don't want, and can save a group as
a new cart.

## Research basis (from the cart reviews in this session)

- Embeddings are `discogs_multi_embeddings-effnet-bs64-1` (1280-d), averaged per track over its previews.
- **Centring** the embeddings on the user's own collection before comparing (cosine) separates styles better than
  raw vectors or centring on a random catalogue sample (removal AUC 0.69 vs 0.62 / 0.65).
- **Ward hierarchical clustering** on the centred, unit-length vectors gives groups the user judged
  stylistically sound. A coarse ↔ fine slider maps to the number of clusters cut from the tree.
- **Push-away (Rocchio)**: `centroid − 0.5 · mean(misses)` raised kept-vs-removed AUC from 0.71 to 0.76.
  Stronger values (≥ 1.0) collapse, so the strength is fixed at 0.5.
- Raw cosine is not comparable across groups (tight sub-genres look closer), and a percentile against the group's
  own tracks saturates at 100 for the best results. The UI therefore shows a continuous **Fit** score.

## Decisions (user-approved)

| Topic | Decision |
|---|---|
| Entry points | "Find similar" action on a cart **and** the search mode `cart:~<cart uuid>` |
| Layout | Group chips (All, or one group) — an app select-button group, active chip in the secondary blue |
| Group colours | Warm palette on dots only: amber `#f2a93b`, green `#7cc66a`, coral `#ef6f57`, yellow `#e6d36a`, tan `#c98a5b` |
| Number in the table | **Fit 0–100**, higher is better: 100 = group centre, 50 = as close as a typical (median) track of the group, 0 = twice that distance. Number only, details in a tooltip |
| Slider start | Automatic: the best-separated split (highest mean silhouette, groups ≥ 3 tracks); "(auto)" shown next to it |
| Map | 2D map only behind a **Map** toggle (secondary-blue select button) |
| Misses | "Not this" (⊘) action per row, a purple primary button. **Session only** — kept in the browser, sent with each request, never stored on the server |
| Always excluded | Tracks the user has heard, ignored (artist, label, release, artist on label), purchased (in the purchased cart), and the cart's own tracks |
| New artists only | Toggle that hides tracks by artists the user follows or has bought from |
| Save group as cart | Button visible from the start, disabled until a group chip is picked. Creates a new cart from the **group's own cart tracks** with a pre-filled, editable name |
| Styling | The current UI's stylesheets and components; no new design system |

## Architecture

### Backend

1. **`routes/shared/cart-similarity/grouping.js`** — pure functions, no I/O, unit-tested:
   - `centre(vectors, mean)`, `normalise`, `meanVector`, `cosine`
   - `wardLinkage(vectors)` → merge list (nearest-neighbour-chain Ward on squared Euclidean distance of unit vectors)
   - `cutTree(linkage, n, k)` → labels; `silhouette(vectors, labels)`; `chooseAutoK(...)`
   - `fitScore(similarity, groupMedianLoo)` and `percentileWithin(similarity, groupLooSims)`
   - `project2d(vectors)` — PCA to two components (power iteration) for the map
2. **`routes/shared/db/cart-similarity.js`** — SQL:
   - load the cart (by uuid, owned by the user) and its tracks' mean embeddings
   - the user's collection mean (average of all tracks in the user's carts), used for centring
   - candidate retrieval per group: HNSW ANN (`ORDER BY embedding <=> query LIMIT pool`) in raw space with the
     group's raw mean as the query, then exclusions (heard, ignores, purchased, cart members, optional new-artists
     filter), returning candidate track ids with their mean embeddings
3. **`routes/shared/cart-similarity/index.js`** — orchestration: groups → push-away → candidate scoring in the
   centred space → per-group top N → Fit, percentile, next-best group → 2D coordinates → `track_details` rows.
4. **API**: `GET /api/me/carts/:uuid/similar?k=&newOnly=&misses=<id,id>&limit=` returns
   `{ cart, k, autoK, maxK, groups: [{ index, name, size, resultCount }], tracks: [... track_details + cartSearch ], map: { members: [{ x, y, group }] }, excluded: { heard, ignored, purchased } }`.
   Each result track carries `cartSearch: { group, fit, closerThan, similarity, nextGroup, nextFit, x, y }`.
5. **`searchForTracks`**: a query containing `cart:~<uuid>` delegates to the cart search at the automatic split
   and returns the merged result list (keeps the `/api/tracks?q=` API and CLI consistent).

Limits: grouping uses at most the 600 most recently added cart tracks; `k` ranges 1…`min(8, ⌊n/3⌋)`;
candidate pool 1,500 per group with `hnsw.ef_search` raised for the transaction; up to 50 results per group.

### Frontend

- `searchTerms.js`: `cart:~<uuid>` parses to `{ type: 'cart', id: <uuid>, similar: true }`; the pill shows the cart
  name (via the existing `names` URL parameter).
- `App.search`: a cart term routes to the new endpoint; the response's tracks become `searchResults` and the rest
  is kept in `cartSearch` state (k, newOnly, misses, chip, mapOpen, groups, excluded, map).
- `CartSearchControls` (new) renders in the track table header: the controls row (slider, New artists only,
  Map toggle, counts), the "Not this" pills (undo / clear all), the group chips and the Save group as cart button,
  and the map when toggled.
- `Track.js`: when a row has `cartSearch`, the score column shows the Fit pill (group dot + number, tooltip with
  details) and the open column holds the ⊘ "Not this" button; the column header reads "Not this".
- Cart view: a "Find similar" button in the cart header starts `cart:~<uuid>`.
- Save group as cart: `POST /api/me/carts { name }` then `PATCH /api/me/carts/:id/tracks` with the group's tracks.

### Data flow

```
cart uuid ─► member embeddings ─► centre on collection mean ─► Ward tree ─► cut at k (auto or slider)
           ─► per-group centroid (− 0.5 · misses in that group) ─► ANN pool per group (raw space)
           ─► exclusions ─► centred cosine to every group ─► best group, Fit, percentile ─► top N per group
```

## Error handling

- Unknown cart or a cart owned by someone else → 404.
- Cart tracks without embeddings are ignored; fewer than 2 embedded tracks → 200 with no groups and an
  explanatory `reason`, rendered as an empty state.
- `k` outside 1…maxK is clamped. Misses that are not valid track ids are ignored.

## Testing

- Unit tests for `grouping.js` (Ward on separable clusters, cut, silhouette/auto k, Fit maths, PCA).
- API integration test with seeded tracks and synthetic embeddings: groups found, exclusions honoured
  (heard / ignored / purchased / cart members), push-away changes the ranking, 404 for a foreign cart.
- `searchTerms` unit tests for the `cart:~` term.
- Paired demo tests (`cart-similarity-local.js` / `cart-similarity-preview.js`) sharing steps and an API-only seed:
  seed tracks, upload synthetic embeddings via `POST /api/admin/analyse`, create a cart, open it, Find similar,
  switch chips, toggle the map, mark a result "Not this", save a group as a cart.

## Out of scope

Persisting misses on the server, learned metrics / fine-tuning (change D), segment-level embeddings, and the
grouping research (change A), whose findings may later tune the defaults above.
