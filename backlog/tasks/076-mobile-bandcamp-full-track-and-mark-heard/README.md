---
id: 076
title: Bandcamp full-track behaviour + mark-heard-on-play
effort: S
created: 2026-05-07
---

# Bandcamp full-track behaviour + mark-heard-on-play

## Why

Per project `CLAUDE.md`: Bandcamp "previews" are the full streaming
MP3, not 30-second clips. Treating them as previews — applying skip
windows or duration-thresholded heard reporting — silently breaks
listening.

## What

- The mobile player must NOT apply preview-window logic
  (`start_ms` / `end_ms` skip) on Bandcamp tracks. Bandcamp
  preview = full track.
- Mark a track heard on `onPlay` (the moment audio starts), not
  after a duration threshold — same behaviour as
  `packages/front/src/Preview.js`.
- Audit task 071's audio engine integration for any default
  preview-clip behaviour and disable it for Bandcamp.

## Acceptance criteria

- [ ] Playing a Bandcamp track plays the full audio with no
      skip-to-end at 30 s.
- [ ] Heard event fires once at the start of playback for any
      track, regardless of store.
- [ ] Audited and documented in `notes.md` how this is enforced
      (test or code path).

## Code pointers

- `CLAUDE.md` (project) — "Bandcamp specifics" section.
- `packages/front/src/Preview.js` — current heard-on-play
  behaviour to mirror.
