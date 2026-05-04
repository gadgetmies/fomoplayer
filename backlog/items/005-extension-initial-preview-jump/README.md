---
id: 005
title: Initial preview jump (toggleable, persisted, default off)
status: todo
priority: P3
effort: L
created: 2026-05-04
depends-on: []
---

# Initial preview jump (toggleable, persisted, default off)

## Why

Triaging a large queue is slow when each track is listened to from the
start. The Fomo Player web UI has a "preview jump" that seeks forward at
the start of a track and skips to the next track at a configured position.
Bringing this to the extension's player on Bandcamp speeds up new-music
triage substantially.

## What

- Implement an initial preview jump in the extension player that mirrors
  the Fomo Player web UI behaviour:
  - Seek forward by a configured offset at the start of each track.
  - Jump to the next track when playback reaches a configured position.
- Add a toggle in the player panel.
- Default to **off**.
- Persist the toggle state across page reloads.

## Acceptance criteria

- [ ] A toggle is visible in the player panel (label clearly conveys
      "preview jump" / "skim mode" or similar).
- [ ] With the toggle off (default), playback runs normally — no seek,
      no auto-skip.
- [ ] With the toggle on, playback seeks to the configured offset at
      track start and advances to the next track at the configured
      threshold.
- [ ] Reloading the Bandcamp page with the toggle on preserves the on
      state.

## Code pointers

- The Fomo Player web UI's preview-jump implementation — source the
  semantics and offset/threshold values, not necessarily the code.
- `packages/browser-extension/` — player panel and audio element wiring.
- Persistence: `browser.storage.local` (per-browser) is the cheapest
  start; user-profile sync would give cross-device but adds API surface.

## Out of scope

- Configurable offset/threshold values — match the web UI defaults for
  this item; expose configuration if/when users ask.

## Open questions

- Persistence channel: `browser.storage.local` vs. user profile sync.
  Local-first unless cross-device parity is a stated requirement.
- Per project `CLAUDE.md`, Bandcamp "previews" are full tracks — the
  jump positions must be relative to the full track duration. Do not
  hardcode 30-second-clip assumptions.
