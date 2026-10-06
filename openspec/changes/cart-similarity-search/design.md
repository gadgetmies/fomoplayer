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

- **Clustering in Node, not SQL or Python.** Carts are small (grouping is capped at 600 tracks), so a
  nearest-neighbour-chain Ward implementation (O(n²) time and memory) in JS is fast enough (< 100 ms at 600) and
  avoids a new service. Alternative: run the clustering in the Python analyser — rejected, it is an offline batch
  worker, not a request-time service.
- **Centring on the user's collection mean.** Computed per request with `AVG(embedding)` over the tracks in all of
  the user's carts. It scored best in the research and needs no stored state. Alternative: a fixed catalogue mean —
  scored lower and needs refreshing.
- **ANN in raw space, scoring in centred space.** The index is on raw vectors, so each group's raw mean (minus the
  raw push-away term) queries the index. A fixed budget of 1,600 previews is split across the groups (300–1,000 per group; 1,000 is the
  pgvector `hnsw.ef_search` maximum), because every HNSW scan costs about the same (~1.5 s cold on production). The pool is
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
- **Separate endpoint plus search-term delegation.** The UI needs groups, counts and map data, which do not fit the
  flat `/api/tracks` response, so it calls `GET /api/me/carts/:uuid/similar`. `/api/tracks?q=cart:~<uuid>` delegates
  to the same function for API/CLI consistency.
- **Session misses in React state.** Sent as `misses=` on every request; nothing is stored server-side.

## Risks / Trade-offs

- [Large carts are slow to cluster] → cap grouping at the 600 most recently added embedded tracks.
- [The collection mean scans the whole collection (~5 s for 5,000 tracks)] → cached per user for an hour; the first
  search after that is slow (measured ~17 s cold on production, ~3 s warm). Precomputing it is a possible follow-up.
- [Heard tracks thin out the pool (565 of 1,303 in the research cart)] → 1,600-preview budget split across groups (300–1,000 each); per-group limit 50.
- [Raw-space ANN can miss candidates that are close only in the centred space] → generous pool, re-scored in the
  centred space; acceptable for a first version and measurable in research change A.
- [Synthetic embeddings in tests do not reflect real audio] → tests check mechanics (grouping, exclusions,
  push-away), not musical quality.

## Migration Plan

No schema changes. Deploy backend and frontend together; the new endpoint and term are additive. Rollback is a revert.

## Open Questions

- Defaults (pool size, push strength, k range) may be tuned by the grouping research (change A).
