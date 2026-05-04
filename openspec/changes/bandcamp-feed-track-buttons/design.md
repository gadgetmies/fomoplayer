## Context

Fomo Player's Bandcamp injection currently fires on three surfaces —
release pages (`#name-section`), per-track rows in the release table,
and discography grids (`#music-grid` / `.music-grid-item`). The feed
page (`https://bandcamp.com/<user>/feed`) is structurally distinct
from all three: it is a server-rendered timeline of mixed entry types
(featured releases, fan collections, "now following" notes, community
posts). The page does not expose `data-tralbum` for individual feed
entries; each entry is a card linking out to a release or track URL,
similar to discography tiles but laid out vertically.

The discography-tile injection already demonstrates the right pattern
for this case: take an entry's `/album/...` or `/track/...` link,
lazy-fetch the release via `fetchReleaseTralbum` (which goes through
the worker to bypass the cross-subdomain CORS), then mount the same
Play / Queue / Add-to-Fomo-Player buttons. Reusing that pattern keeps
the new surface consistent with existing ones and avoids any new
permissions, message types, or scrape paths.

## Goals / Non-Goals

**Goals:**
- Inject Play, Queue, and Add-to-Fomo-Player buttons on each playable
  entry of the Bandcamp feed.
- Reuse `cueButton`, `renderCartButton`, `fetchReleaseTralbum`, and the
  existing `INJECTED_ATTR` re-injection guard verbatim.
- Behave correctly under feed virtualisation / infinite scroll: as
  Bandcamp inserts more story rows, the MutationObserver-driven
  `reinjectSoon` pass picks them up.
- Skip non-playable feed entries cleanly (no broken or stub buttons).

**Non-Goals:**
- Restyling or relocating the feed buttons (cover-overlay-style polish
  is item 016; vertical alignment is item 018; backdrop colour is part
  of items 013 / 016).
- Detecting and handling community posts as anything other than
  "skipped".
- Reflecting per-track cart membership in the dropdown (item 009).
- Any backend / message-protocol change.

## Decisions

### Identify playable entries by their outbound link, not entry classes

Bandcamp's feed markup uses many entry-type-specific class names that
change over time (`story-innards`, `story-fan-collection-item`,
`collection-item-container`, `featured-track-info`, etc.). Targeting
class names directly is brittle. Instead, walk the feed for elements
whose anchor links match `/album/...` or `/track/...` and treat the
nearest stable container as the entry. This is the same heuristic
`injectDiscographyButtons` already uses on the discography grid, and
it degrades gracefully when Bandcamp tweaks its feed markup.

**Alternative considered:** Hard-coded selectors like
`.story-innards .featured-track-info`. Rejected because feed entry
types vary and the markup has historically changed without notice.

### Lazy-fetch the release per entry, cache via `fetchReleaseTralbum`

Each feed entry only carries a release URL — not the embedded
`data-tralbum` payload — so we have to fetch the release page to
resolve `trackinfo`. The existing `fetchReleaseTralbum` already
handles this: it round-trips through the service worker (which has
`*.bandcamp.com` host permission) and caches by absolute URL.
Reusing it means feeds with many entries pointing at the same release
(common — feed entries duplicate when an artist's release surfaces
across followers) only pay one network round-trip.

**Alternative considered:** Pre-fetch every entry on inject. Rejected
because the feed can be hundreds of entries deep and most users only
ever interact with a handful — eager fetching would burn bandwidth
and rate-limit headroom for no gain. Lazy fetch on click is the
discography pattern and is fast enough.

### Hook into the existing `reinjectSoon` loop

Adding a third page detector (`onFeedPage()`) and a third injector
call (`injectFeedButtons()`) inside the existing `reinjectSoon`
timer keeps every Bandcamp injection going through one observer and
one debounce window. The MutationObserver already fires when the feed
loads more entries via infinite scroll, so the new injector picks
them up automatically.

**Alternative considered:** A separate observer scoped to the feed
container. Rejected because the existing observer already runs at
`document.documentElement` subtree level — adding a second one
duplicates work and makes debouncing harder.

### Choose the entry container by walking up to a stable ancestor

After finding the `/album/...` or `/track/...` anchor, climb to the
nearest list item or top-level story wrapper to mount the button row.
We prefer `.story-innards`, `.collection-item-container`,
`.story-fan-collection-item`, or finally `li` as a fallback — using
the first ancestor that matches. This stays robust to inner layout
changes while still mounting the buttons in a stable place. The
mount point is set `position: relative` if static, mirroring the
discography behaviour, so the button row can absolutely position
itself in a corner the same way.

## Risks / Trade-offs

- **Risk:** Bandcamp ships a new feed entry type whose anchor matches
  `/album/...` but is not actually playable (e.g. a "follow this
  artist" recommendation). → Mitigation: `fetchReleaseTralbum`
  already returns `null` for pages without `trackinfo`, and the
  buttons handle the empty-array path with an inline error toast.
  No silent breakage.
- **Risk:** The feed virtualises / infinite-scrolls, churning DOM
  nodes and triggering rapid MutationObserver fires. → Mitigation:
  the existing `reinjectSoon` timer debounces to 250 ms and the
  `INJECTED_ATTR` marker prevents double-injection on repeated
  passes.
- **Trade-off:** Lazy-fetch means the first click on a feed entry
  pays a worker round-trip before playback starts. The cue button's
  loading spinner already covers this — feed playback feels the same
  as discography-grid playback, which already takes the same path.
- **Trade-off:** Some feed surfaces (fan collections grouping
  multiple tracks under one card) will get one button row rather
  than per-track buttons. Per-track injection inside fan-collection
  cards is out of scope here — the entry-level Play behaves like
  "play this release" and matches user expectation for a feed.
