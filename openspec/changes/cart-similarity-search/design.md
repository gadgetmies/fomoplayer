## Context

Single-track similarity search (`track:~<id>`) already uses the HNSW cosine index on
`store__track_preview_embedding` (`discogs_multi_embeddings-effnet-bs64-1`, 1280-d) in a two-phase query: ANN
candidate pool first, catalogue joins and user filters after. Offline research on the user's carts
(see `docs/superpowers/specs/2026-10-06-cart-similarity-search-design.md`) established the grouping method,
centring, push-away strength and the Fit scale. The UI was approved through a mockup built from the app's own CSS.

## Goals / Non-Goals

**Goals:**
- Search by cart with groups, adjustable coarseness, push-away from session misses, and a comparable Fit score.
- Reuse the existing HNSW index, track_details rows and track table rendering.
- Keep all heavy maths (clustering, scoring, projection) in pure, unit-testable JS.

**Non-Goals:**
- Persisting misses or learning from them across sessions.
- New embedding models, segment embeddings or learned metrics.
- Changing single-track similarity search.

## Decisions

- **Clustering in Node, not SQL or Python.** Carts are small (grouping is capped at the 300 newest tracks), so a
  nearest-neighbour-chain Ward implementation (O(n²) time and memory) in JS is fast enough (Ward and the automatic `k` take < 1 s at 300) and
  avoids a new service. Alternative: run the clustering in the Python analyser — rejected, it is an offline batch
  worker, not a request-time service.
- **Centring on the user's collection mean.** Computed per request with `AVG(embedding)` over the tracks in all of
  the user's carts. It scored best in the research and needs no stored state. Alternative: a fixed catalogue mean —
  scored lower and needs refreshing.
- **ANN in raw space, scoring in centred space.** The index is on raw vectors, so each group's raw mean (minus the
  raw push-away term) queries the index. A fixed budget of 1,000 previews is split across the groups (200–500 per group; pgvector caps
  `hnsw.ef_search` at 1,000), because every HNSW scan costs about the same and reads its index pages from disk when
  they are not cached (up to ~10 s cold on production for two groups). The pool is
  then scored inside Postgres against every group's centred, pushed centroid (pgvector `-`, `<=>`, `<#>`), so only
  similarities and map projections travel to Node. Alternative: centred vectors in the
  index — requires a per-user index, rejected.
- **Exclusions in SQL on the pool.** Heard (`user__track_heard`), ignores (artist, label, release, artist on label),
  purchased cart, searched cart and, optionally, followed or purchased artists are filtered while fetching the pool,
  and counted so the UI can explain what was left out.
- **Fit = 100 − 50 · (1 − s) / (1 − median LOO similarity).** Continuous, comparable across groups, and does not
  saturate the way a within-group percentile does; the percentile is still returned for the tooltip.
- **2D map by PCA, not UMAP.** PCA of the centred member and result vectors needs no dependency and is stable between
  requests. UMAP looked nicer offline but would need a native/JS dependency at request time.
- **One search route.** The cart search is the `cart:~<uuid>` term of `GET /api/tracks`, like the other similarity
  terms, so the API stays consistent and the other terms filter the results. Every search response is
  `{ tracks, page: { offset, limit, total }, meta }`, the same envelope as one of the user's track lists; a cart
  search adds the groups, counts and map as `meta.cartSearch`.
  Alternative: a separate `/api/me/carts/:uuid/similar` endpoint (the first version) — dropped for consistency.
- **Filters: score directly when selective, otherwise filter the nearest.** An artist, label, release, track, genre,
  key or bpm term matching at most 2,000 tracks is scored directly, so e.g. a label's most cart-like tracks are found
  even when none is among the nearest. Free text and stores match most of the catalogue, so they only filter the
  nearest tracks.
- **Session misses in React state.** Sent as `misses=` on every request; nothing is stored server-side.

## Risks / Trade-offs

- [Large carts are slow to cluster and to load] → only the 300 most recently added analysed tracks are used; they are
  picked before any embedding is averaged, and the UI says how many of the cart's tracks were used.
- [The collection mean reads the whole collection (5–10 s cold on production)] → cached per user; it is computed in
  the background when the carts load, and after an hour the stale value is used while a fresh one is computed.
- [Production responses time out after 25 s] → the independent queries run in parallel, the previews are resolved to
  tracks by primary key (a hash join scanned all of `store__track` and pushed the vector index out of the cache), and
  the pool budget is 1,000. Measured on the 3,648-track Purchased cart: ~19 s cold, 4–10 s warm.
- [Heard tracks thin out the pool (565 of 1,303 in the research cart)] → per-group limit 50 from a 200–500 preview pool
  per group.
- [Raw-space ANN can miss candidates that are close only in the centred space] → generous pool, re-scored in the
  centred space; acceptable for a first version and measurable in research change A.
- [Synthetic embeddings in tests do not reflect real audio] → tests check mechanics (grouping, exclusions,
  push-away), not musical quality.

## Migration Plan

No schema changes. Deploy backend and frontend together; the new endpoint and term are additive. Rollback is a revert.

## Open Questions

- Defaults (pool size, push strength, k range) may be tuned by the grouping research (change A).
