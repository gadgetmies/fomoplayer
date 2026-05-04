---
id: 002
title: Play / queue / add-to-cart buttons on Bandcamp feed
status: todo
priority: P1
effort: M
created: 2026-05-04
depends-on: [001]
---

# Play / queue / add-to-cart buttons on Bandcamp feed

## Why

The Bandcamp feed (e.g. `https://bandcamp.com/<user>/feed`) is one of the
primary discovery surfaces for users following labels and artists, but it
currently has none of the extension's row-level controls. Users have to
click through to a release or track page before they can act on a feed
entry.

## What

- Inject **play**, **queue**, and **add-to-cart** buttons on each track
  surface on the feed page.
- Behaviour matches the same buttons elsewhere (release pages, track rows).

## Acceptance criteria

- [ ] Visiting `https://bandcamp.com/<user>/feed` shows play, queue, and
      add-to-cart buttons on each track entry.
- [ ] Each button behaves the same as on release pages: play starts
      playback (and queues the track per item 001), queue appends without
      starting, add-to-cart opens the carts dropdown.

## Code pointers

- `packages/browser-extension/` — content scripts that inject controls on
  release/track pages; find the equivalent feed entry selectors.
- Bandcamp feed DOM selectors (verify in dev tools — feed markup differs
  from album/track pages).

## Out of scope

- Non-track feed entries (community posts, fan-collection updates) — only
  apply to entries that represent a playable track or release.

## Open questions

- Bandcamp feed entries can be releases, individual tracks, or community
  posts. Which entry types should get buttons? Probably tracks and
  releases, not posts.
