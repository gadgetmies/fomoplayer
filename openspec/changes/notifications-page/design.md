## Context

See `docs/superpowers/specs/2026-10-19-notifications-page-design.md`. The
backend API comes from `notification-backend`; the player's source queue,
"Playing from" and docked mode from `one-player`.

## Goals / Non-Goals

**Goals:** bell + unread count; Activity / Samples / Subscriptions tabs; A/B
and loop-match; Settings › Email; bells on Following.

**Non-Goals:** the bell dropdown, email frequency, keyboard shortcuts J/K/A for
matches, the phone-specific sample layout beyond the responsive tables.

## Decisions

- **Page below the full Preview panel (Player `panelOnly`)** rather than a new
  player: keeps one audio element and reuses Preview's waveform and controls.
- **Notifications lists are snapshots for the queue**: they are not
  `listState` lists, so `listSource` returns null on the page and the snapshot
  taken at play time drives next/previous.
- **A/B inside Preview** with a pure `abTiming.js` for the time mapping, so the
  maths is unit-tested and Preview only swaps the source and seeks.
- **Polling the unread count** (60 s, focus, after plays) instead of push: the
  count changes at most every job run (30 min / hourly).
- **Bells reuse search subscriptions** (`artist:<id>` / `label:<id>`), as the
  backend already does.

## Risks / Trade-offs

- [Old matches lack offset/tempo] → B plays from the start, loop disabled,
  "Matched at" shows "—".
- [Sample audio on another origin] → Preview's waveform generation may fail on
  CORS; playback still works.
- [Preview demo cannot create events] → the preview demo covers the empty
  Activity state; the local demo seeds events via the DB.

## Migration Plan

Front-end plus one query fix; no migrations. Rollback is a revert.

## Open Questions

None.
