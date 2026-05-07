---
id: 033
title: Implement infinite scroll in the carts table
effort: M
created: 2026-05-06
---

# Implement infinite scroll in the carts table

## Why

Selecting a cart currently fetches *all* of its tracks in one request
(`/carts/:id` with no `offset`/`limit`) and renders the lot. For
large carts this means a slow first paint and a lot of memory held
for tracks the user never scrolls to. The main tracklist already
paginates as the user scrolls; the carts view should behave the same
way.

## What

- Page the carts fetch from the front end and keep loading more rows
  as the user scrolls the table, like the main tracklist does today.
- Track per-cart "has more" / "loading more" state separately from
  the main tracklist's flags so the two don't interfere.
- No backend changes required — `/carts/:id` already accepts
  `?offset=` and `?limit=` (`packages/back/routes/users/api.js:345`)
  and `getCartDetails` honours them.

## Acceptance criteria

- [ ] First paint of a cart fetches at most one page of tracks (same
      page size as the main tracklist) instead of the entire cart.
- [ ] Scrolling near the bottom of the carts table fetches the next
      page and appends rows. The "loading more" indicator at the
      bottom of `Tracks.js` shows during the fetch.
- [ ] When the cart is exhausted, `hasMore` flips to false and no
      further fetches fire even if the user keeps scrolling.
- [ ] Switching carts resets the per-cart paging state — no leftover
      "loading more" or stale offsets from the previous cart.
- [ ] Adding/removing a track from the currently-shown cart still
      reflects in the visible rows (the existing `PATCH
      /carts/:id/tracks` returns the full cart details — decide
      whether to keep that contract or switch the patch response to
      first-page-only).

## Code pointers

- `packages/back/routes/users/api.js:345` — `GET /carts/:id` already
  accepts `offset` / `limit`. Confirm `getCartDetails` returns a
  `meta`-style total or a `hasMore` flag the frontend can rely on
  (extend if missing).
- `packages/front/src/App.js:830` — `selectCart` is the single fetch
  point. Today it calls `/carts/${uuid}${filter}` with no pagination;
  add `offset` / `limit` and merge results into the cart's `tracks`
  array on subsequent loads.
- `packages/front/src/App.js:149` and `:164` — `hasMoreTracks()` and
  `loadMoreTracks()` are the working pattern for the main tracklist.
  Mirror their shape for the carts view (or generalise — see
  Out of scope).
- `packages/front/src/App.js:1098` — the `Player` is rendered with
  `loadingMore` / `hasMore` / `onLoadMore` props that today only
  cover the main tracklist. The carts table likely needs its own set
  of these props (or a context-aware switch) since the same `Tracks`
  component renders both views.
- `packages/front/src/Tracks.js:419` — `onLoadMore` trigger on
  scroll. Already generic; should not need changes.
- `packages/front/src/App.js:366` and `:376` — `addToCart` /
  `removeFromCart` call `PATCH /carts/:id/tracks` and replace the
  cart's `tracks` array wholesale via `updateCart`. Once paging is
  in place this overwrite undoes the user's scroll position; the
  patch response handling needs to be reconciled with the paged
  state.

## Out of scope

- Generalising the infinite-scroll plumbing into a shared hook /
  helper. Useful, but a separate refactor — do this item with the
  same shape as the existing `loadMoreTracks` first.
- Changes to the cart sort order or filtering UI.
- Server-side limits or rate-limiting changes.

## Open questions

- Does `getCartDetails` already return a total-count or `hasMore`
  signal? If not, the cleanest options are to add one or to rely on
  "page came back shorter than `limit` ⇒ no more". The latter avoids
  a schema change but loses the ability to show a total.
- What page size is appropriate? Probably the same constant the
  main tracklist uses — find it and reuse, don't invent a new one.
- How to reconcile `addToCart` / `removeFromCart` responses with
  the paged cart state? Three options: (a) keep the full-cart
  response and reset paging, (b) change the patch response to a
  small delta, (c) only patch the in-memory list and skip the
  refetch. Pick whichever keeps scroll position without over-
  fetching.
