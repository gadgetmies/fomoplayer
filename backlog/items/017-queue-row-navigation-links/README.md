---
id: 017
title: Navigate to track / release / artist / label from queue rows
status: todo
priority: P2
effort: M
created: 2026-05-04
depends-on: []
---

# Navigate to track / release / artist / label from queue rows

## Why

Each row in the embedded player's queue panel today shows the track title
and artist as plain text. The only click target is the row itself (which
plays that track) and the per-row remove button. If a user wants to open
the source page for a queued item — to read the description, buy the
release, follow the artist, or browse the label's catalogue — there is
no path from the queue. They have to remember where the track came from
and re-find it on Bandcamp.

The queue is the natural place to expose those links: it's the canonical
list of "things I've decided to listen to", so following up on a track
should be one click away.

## What

- In each queue row, surface clickable links for:
  - **Track** — the standalone track page on the source store
    (e.g. Bandcamp `/track/...`).
  - **Release** — the album / EP / single page (e.g. Bandcamp `/album/...`).
  - **Artist** — the artist's page on the source store.
  - **Label** — the label's page, when the source store distinguishes
    label from artist (Bandcamp labels host multiple artists). Skip the
    link when no label URL is available rather than showing an inert
    placeholder.
- Links MUST be rendered as ordinary HTML `<a href="...">` elements that
  navigate in the **current tab** by default. Do not set `target="_blank"`.
  Standard browser affordances (middle-click, Cmd/Ctrl-click, right-click
  → "Open in new tab") MUST keep working so the user picks the target.
- Clicking a link MUST NOT trigger the row's "play this track" action; the
  click stays on the link.

## Acceptance criteria

- [ ] Each queue row exposes Track, Release, and Artist links rendered as
      regular HTML `<a>` elements that navigate in the current tab on
      plain click and respect standard "open in new tab" modifier clicks.
- [ ] Label link appears only when the queued track has a label distinct
      from the artist; otherwise it's omitted (no broken or empty link).
- [ ] Clicking any of those links does not change the active track or
      start playback of that row.
- [ ] Clicking the rest of the row still plays the track (existing
      behaviour preserved).
- [ ] The remove (X) button still works.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp/player-ui.js` —
  `rebuildQueue` builds each row's HTML; that's where the links go. The
  row click handler at `row.addEventListener('click', ...)` already
  guards against the remove button via `e.target.closest('[data-remove]')` —
  the same pattern can guard against link clicks.
- `packages/browser-extension/src/js/content/bandcamp/scrape.js` (and
  whichever transforms feed Tralbum payloads into the queue track shape)
  — extend the track shape with the URLs needed for the new links if
  they aren't already there. The active player view already uses
  `track.releaseUrl`, so that field is present; `trackUrl`, `artistUrl`,
  `labelUrl` may need to be derived/added.
- `packages/back/` (or wherever the canonical track shape lives in
  `fomoplayer_shared`) — if the same payload structure is shared with
  the web frontend, additions should land in the shared shape so both
  sides agree.

## Out of scope

- Adding the same links to the player view's "now playing" metadata
  strip (it already has a release link; track / artist / label there is
  a related but separate enhancement).
- Inline previews of track / release / artist pages.
- Following / favouriting the artist or label from the queue.

## Open questions

- Visual treatment: tiny inline text links under the title/artist line,
  or icons on hover, or a popup menu? Density of the queue row matters
  — three or four links inline could clutter.
- Source-store breadth: only Bandcamp at first, or design the data model
  for any store from day one? Today the only injected store is
  Bandcamp; other stores feed the web frontend's queue but not this
  embedded one. Recommend designing the field names store-agnostically
  and populating only what Bandcamp provides for now.
