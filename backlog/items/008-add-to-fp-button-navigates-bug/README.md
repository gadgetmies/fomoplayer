---
id: 008
title: Fix "Add to Fomo Player" button on release pages navigates instead of adding
status: todo
priority: P1
effort: S
created: 2026-05-04
depends-on: []
---

# Fix "Add to Fomo Player" button on release pages navigates instead of adding

## Why

On a release page (e.g.
`https://offishproductions.bandcamp.com/album/plot-holes-vol-4`), clicking
the injected "Add to Fomo Player" button next to a track currently
navigates to the track's own page instead of adding the track. The click
event is propagating to Bandcamp's own row click handler. This is a pure
regression — the button isn't doing its job.

## What

- Stop the click from triggering Bandcamp's track-row navigation.
- Adding a track must keep the user on the release page.

## Acceptance criteria

- [ ] On a release page with multiple tracks, clicking the "Add to Fomo
      Player" button on a track adds the track and the page does **not**
      navigate.
- [ ] No regression to the existing behaviour on track pages where the
      button works.

## Code pointers

- `packages/browser-extension/` — find the click handler attached to the
  "Add to Fomo Player" button injected on release pages. Likely needs
  `event.stopPropagation()` and possibly `event.preventDefault()` on the
  button's click handler.
