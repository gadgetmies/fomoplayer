---
id: 226
title: Decouple "in default cart" / "in any cart" badges from the full tracks fetch
effort: M
created: 2026-05-10
status: dropped
dropped_reason: superseded by item 033 (carts-table-infinite-scroll), which folded the membership refactor into the same change — track rows now carry cart_ids directly.
---

# Decouple "in default cart" / "in any cart" badges from the full tracks fetch

> **Dropped 2026-05-10** — superseded by item 033, which folded the
> membership refactor into the same OpenSpec change. Track rows now
> carry `cart_ids` directly via the new `track-cart-membership`
> capability, and `updateDefaultCart` was deleted entirely. See
> `openspec/changes/carts-table-infinite-scroll/` (or the post-archive
> location at `openspec/specs/track-cart-membership/spec.md`).

## Why

After item 033 paginates the carts view, the same paging now applies to
`updateDefaultCart` (the carts list also goes through the public uuid
route at `/carts/<uuid>?offset=0&limit=20`). That breaks the badges
that today decide whether a track row should render an "in default
cart" / "in cart X" indicator by scanning `defaultCart.tracks?.find(id)`
or `carts.filter(cart => cart.tracks?.find(id))` — those checks now
only resolve correctly for the most recent N tracks per cart (where N
is `CART_TRACKS_PAGE_SIZE`, currently `20`).

Pre-existing: this was *already* silently truncated to the backend's
default `limit: 200`. After 033 the truncation is more visible (20 vs.
200), so the latent bug becomes a regression for users with active
carts that exceed the page size.

## What

- Stop relying on `cart.tracks?.find(trackId)` for cart-membership
  decisions in `Tracks.js` and `Player.js`. Replace with a
  membership-set lookup that does not require fetching full track rows.
- Add a backend endpoint that returns just the set of track ids in a
  cart (or the membership of *visible* track ids against a cart),
  without the full `track_details` JSON joins that today's
  `getCartDetails` path performs.

  Two viable shapes (pick during design):
  - **Per-cart id list**: `GET /me/carts/<uuid>/track-ids` →
    `{ trackIds: number[] }`. Frontend caches the set, keys by cart
    uuid, refreshes after add/remove.
  - **Batched lookup**: `POST /me/cart-memberships` with
    `{ trackIds: number[] }` → `{ <trackId>: { defaultCart: boolean,
    cartIds: number[] } }`. Frontend asks per visible page rather than
    holding the whole id list in memory.
- Update `Tracks.js:580` (`inDefaultCart={defaultCart ?
  defaultCart.tracks?.find(R.propEq(id, 'id')) !== undefined : false}`)
  and the same pattern at `Tracks.js:542` and `Player.js:197` /
  `:259` / `:265` to use the new membership lookup.
- Add `addToCart` / `removeFromCart` reconciliation to update the
  membership set in place (no extra round trip).

## Acceptance criteria

- [ ] A user with a default cart of 50+ tracks sees correct
      "in default cart" badges on every track row in the main
      tracklist, regardless of whether the track was added to the
      cart recently or long ago.
- [ ] Same for non-default carts and the multi-cart "in carts" badge
      surfaced by `Player.js:259`.
- [ ] The frontend does **not** hold the full `tracks` array of any
      cart in memory just to power membership checks — the membership
      set (or per-page lookup) is the only data needed.
- [ ] After a `PATCH /carts/:id/tracks` add or remove, the membership
      indicator for the affected track flips immediately without a
      full cart refetch.

## Code pointers

- `packages/front/src/App.js:411` (`updateDefaultCart`) — currently
  fetches the default cart paginated to `CART_TRACKS_PAGE_SIZE` after
  item 033. Replace its callers' assumption that
  `defaultCart.tracks` is exhaustive with the new membership lookup.
- `packages/front/src/Tracks.js:542` and `:580` — membership scans
  over `cart.tracks` for "in carts" and "in default cart" badges.
- `packages/front/src/Player.js:197` / `:259` / `:265` — same pattern
  in the player chrome.
- `packages/back/routes/users/api.js:317`-`:357` — cart routes; the
  new membership endpoint can mount here.
- `packages/back/routes/shared/db/cart.js` — sibling query to
  `queryCartDetails` that returns just `track_id` rows for a cart.

## Out of scope

- Any change to the carts-view rendering (item 033 owns that).
- Generalising the membership-check pattern to non-cart relations
  (e.g. follows, ignores) — separate refactor.
- Cross-session caching of the membership set (rebuild on each app
  load is fine).

## Open questions

- Per-cart id list vs. per-page batched lookup: pick the simpler one
  unless the per-cart id list grows large enough to be its own
  payload concern (carts with thousands of tracks). Default proposal:
  per-cart id list — simplest mental model, fits the existing call
  sites with minimal restructuring.
- Should the membership set be eagerly populated on app load, or
  lazily on first render of a track row that needs it? Eager keeps
  the badge-toggle latency at zero; lazy avoids a round trip for
  users who never look at carts. Default proposal: eager (matches
  today's behaviour where `updateDefaultCart` runs on mount).

## Depends on

- Item 033 (`carts-table-infinite-scroll`) — exposes the membership
  bug by tightening the page size from 200 to 20.
