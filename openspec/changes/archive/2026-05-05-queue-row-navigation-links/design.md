## Context

The queue list lives in the embedded player's shadow DOM and is
rebuilt from `state.queue` whenever the queue signature changes. Each
row is a `<div class="qrow">` whose click handler triggers
`audio:play-at`, with a single `[data-remove]` button as an internal
exclusion the click handler already guards against. The release link
exists in the now-playing strip (`refs.releaseLink`) but does not
appear in queue rows.

The queue track shape is produced by `buildQueueItemsFromReleases`
in `service_worker.js`, which already pulls `releaseUrl` from
`release.url`. Bandcamp's tralbum payload also exposes a
`title_link` per track (relative path like `/track/some-track`) and
the artist subdomain origin can be derived from `release.url`.

## Goals / Non-Goals

**Goals:**
- Each queue row exposes Track, Release, and Artist links rendered
  as ordinary `<a href="…">` elements that navigate in the current
  tab on plain click.
- A Label link appears only when the queued track has a label
  distinct from the artist; when no label URL is present (or it
  equals the artist URL), it's omitted with no broken or empty
  link.
- Clicking a link does not change the active track or start
  playback. Modifier-clicks (Cmd/Ctrl/middle, right-click "Open in
  new tab") keep working — links are not hijacked with
  `preventDefault`.
- The remove button still works.

**Non-Goals:**
- Add the same links to the now-playing metadata strip.
- Inline previews of track / release / artist pages.
- Following / favouriting the artist or label from the queue.

## Decisions

### Derive URLs in the worker, not in the UI

Building the URLs in `buildQueueItemsFromReleases` keeps the queue
item shape source-store-agnostic and lets the UI render plain
`<a href="…">` without re-deriving anything. It also means future
non-Bandcamp surfaces can populate the same fields and reuse the
same UI.

**Alternative considered:** Derive URLs in the UI by parsing
`releaseUrl`. Rejected — pushes Bandcamp-specific origin handling
into the player UI and couples the two concerns.

### Use `e.target.closest('a')` to guard the row click handler

The row's click handler already uses `e.target.closest('[data-remove]')`
to exclude the remove button. Adding the same closest-on-`a`
exclusion keeps both guards consistent and lets the browser's
default link behaviour run untouched. We deliberately do **not**
call `e.preventDefault()` or `e.stopPropagation()` on the link
itself — that would block modifier-click open-in-new-tab.

**Alternative considered:** Click handler that re-implements
modifier-click semantics (read `event.metaKey` etc and dispatch
`window.open` accordingly). Rejected as fragile and unnecessary —
plain `<a href="…">` already handles all of that.

### Omit a link when its URL is missing or duplicates another

For Bandcamp, the label-vs-artist distinction is real but
inconsistent: most artist pages double as labels (one band, one
URL). When `labelUrl` is missing or identical to `artistUrl`, we
omit it rather than render an inert placeholder, matching the
backlog spec.

## Risks / Trade-offs

- **Risk:** The label URL Bandcamp exposes (`release.current?.label_url`
  or similar) is not always available; the field varies between
  pages and over time. → Mitigation: best-effort lookup with
  fallback to `null`. The UI omits the link when null, so a missing
  field never renders a broken link.
- **Trade-off:** Adding four URL fields to every queue item slightly
  inflates the queue payload broadcast over `audio:state`. The
  extra bytes are negligible compared to existing fields like
  `audioUrl` and `releaseArtUrl`.
- **Trade-off:** Inline links can crowd a queue row visually. We
  render them as small, muted text under the artist line so the
  row's primary information (title / artist) stays prominent.
