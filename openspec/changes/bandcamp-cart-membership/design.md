## Context

Cart membership today is opaque to the dropdown: `bandcamp:get-carts`
returns `{ id, name }` per cart and nothing else. Each cart's tracks
live behind `/api/me/carts/:id`. The dropdown also has no notion of
"this row's track is already in this cart", so it can't show
membership or wire a remove path. The remove flow is plumbed
(`bandcamp:remove-from-cart`) but unreachable from the UI.

The dropdown's `setRowState` machinery and `pending` re-entry guard
from item 010 already cover the loading / success / error lifecycle
for both add and remove paths — only the click handler's destination
message differs.

## Goals / Non-Goals

**Goals:**
- The dropdown opens with each row marked correctly as in-cart or
  not-in-cart.
- Clicking an in-cart row removes the track from that cart and flips
  the row to not-in-cart in place, without closing the dropdown.
- Clicking a not-in-cart row continues to add the track and flips
  the row to in-cart in place.
- The lifecycle (loading / success / error / re-entry guard) reuses
  the existing infrastructure.
- Worker round-trips stay bounded — at most one fetch per cart per
  open, plus one ingest call.

**Non-Goals:**
- Display per-track membership when the dropdown opens for a
  release with multiple tracks (the row only knows "any of the
  release's tracks is in this cart" — finer-grained per-track
  membership inside the dropdown is out of scope).
- Make the create-and-add path show membership ahead of creation
  (a brand-new cart can't already contain anything).
- Add a "remove from all carts" shortcut.

## Decisions

### Extend `bandcamp:get-carts` instead of adding a new handler

A new `bandcamp:get-cart-membership` handler would force the
dropdown to issue two calls on open. Extending the existing handler
keeps the open path to a single round-trip from the popup's
perspective: the worker fans out to per-cart fetches in parallel
and returns one annotated payload.

**Alternative considered:** A separate handler. Rejected as more
plumbing for no gain.

### Annotate carts with `containsTrackIds: number[]`, not a boolean

Per-cart `containsTrackIds` lets the click-to-remove path send
exactly the right track IDs to remove (no over-removing tracks the
user didn't ask about). For the common single-track release this
collapses to a one-element array; for multi-track releases (the
release-title and discography surfaces) it correctly captures
"these tracks are in, those aren't".

**Alternative considered:** Boolean `inCart`. Rejected — would force
a follow-up "which exact tracks?" call on remove click.

### Remove uses `bandcamp:remove-from-cart` with the row's trackIds

Wire the click handler to dispatch
`bandcamp:remove-from-cart { cartId, trackIds: row.containsTrackIds }`
when the row is in-cart, and the existing
`bandcamp:add-to-cart { cartId, releases }` when not. After settle,
the row's `containsTrackIds` is updated in place: an add fills it
with all the resolved FP track IDs, a remove empties it to `[]`.
The visual treatment derives from the array length each time
`setRowState` is called.

### In-cart rows render a "remove from cart" icon and tinted background

Visual contract: not-in-cart rows show the existing `PLUS_ICON` and
the row tints idle background (white). In-cart rows show a new
"minus / remove" icon and tint the background a subtle
"already-set" colour (`#eef5ff` — the same blue tint family used
elsewhere). Hovering an in-cart row keeps it readable; clicking it
runs the remove path with the same loading / success / error
lifecycle as add.

## Risks / Trade-offs

- **Risk:** N+1 worker fetch on dropdown open (one per cart). →
  Mitigation: parallelise via `Promise.all`. Typical user has fewer
  than 20 carts; latency is fine.
- **Risk:** Bandcamp release with many tracks creates a long ingest
  (the worker has to resolve every track to an FP ID before
  membership can be checked). → Mitigation: this is the same path
  `bandcamp:add-to-cart` already takes; the dropdown already pays
  this cost on add. We just shift it earlier (on open).
- **Trade-off:** A user who never opens the dropdown's full state
  (only clicks add immediately) pays the ingest cost on open. Worth
  it — the ingest is the same one `add-to-cart` would do, just
  hoisted. Avoids a perceived regression where the dropdown shows
  outdated membership for a heartbeat.
