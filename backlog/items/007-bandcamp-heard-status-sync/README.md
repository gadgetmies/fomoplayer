---
id: 007
title: Visualise heard status on Bandcamp; sync to Fomo Player Recently Played
status: todo
priority: P2
effort: L
created: 2026-05-04
depends-on: []
---

# Visualise heard status on Bandcamp; sync to Fomo Player Recently Played

## Why

Heard status is a core Fomo Player concept but currently invisible while
browsing Bandcamp. Worse, listening on Bandcamp doesn't update Fomo
Player, so the two surfaces drift and users re-listen to tracks they've
already heard.

## What

- Visualise the heard status on Bandcamp pages: track rows on release
  pages, feed entries, and any other surface where the extension already
  injects controls.
- When the user listens to a Bandcamp track via the extension, mark it
  heard in Fomo Player.
- Tracks listened to via the extension on Bandcamp should appear in the
  **Recently played** list in Fomo Player.

## Acceptance criteria

- [ ] Visiting a Bandcamp release page shows visible heard indicators on
      tracks that are already heard in Fomo Player.
- [ ] Playing a track via the extension marks it heard the moment audio
      starts playing (`onPlay`), with no time threshold — matching the
      web UI's `Preview.js` behaviour (per project `CLAUDE.md`, Bandcamp
      previews are full tracks).
- [ ] The Recently played list in Fomo Player includes Bandcamp listens
      within seconds of playback starting.

## Code pointers

- `Preview.js` (frontend) — heard-on-play behaviour reference.
- `packages/browser-extension/` content scripts.
- Existing heard-status API endpoints used by the web UI.

## Out of scope

- Backend schema changes — assume the existing endpoints used by the web
  UI are reused.
