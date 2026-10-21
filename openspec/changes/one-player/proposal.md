## Why

Playback in the app has no single owner: on Settings the player is hidden but
keeps playing, next/previous follow whatever list is on screen rather than the
list a track was started from, and audio samples play in their own `<audio>`
elements on top of the player. The notifications redesign (canvas "Sample Match
Playback") needs one player that follows the user everywhere before the
Notifications page can play its lists through it. Design:
`docs/superpowers/specs/2026-10-19-one-player-design.md`.

## What Changes

- Next / previous follow the list the current track was started from
  ("playing from" source), not the list on screen.
- The Preview panel shows "Playing from <source>" linking back to that list.
- On Settings the player becomes a docked mini player at the bottom of the
  viewport instead of being hidden.
- Audio samples on Settings › Notifications play through the one player; their
  own audio elements are removed.

## Capabilities

### New Capabilities
- `one-player`: play-queue source tracking, "Playing from", the docked mini
  player on Settings, and samples played through the app player.

### Modified Capabilities

(none)

## Impact

- `packages/front/src/`: new `playQueue.js` (+ test), `App.js`, `Player.js`,
  `Preview.js` (+ CSS), `Settings.js`.
- Browser demo tests `one-player-local.js` / `one-player-preview.js` with shared
  steps and seed in `packages/back/test/lib/`.
- No backend changes.
