## Context

See `docs/superpowers/specs/2026-10-19-one-player-design.md`. `Player.getTracks()`
selects the list from `listState`; App forces `listState='new'` and
`display:none` on the Player while Settings is shown; Settings renders one
hidden `<audio>` per audio sample.

## Goals / Non-Goals

**Goals:** a single audio element for all playback; source-following
next/previous; "Playing from"; docked mini player on Settings; samples via the
player.

**Non-Goals:** the Notifications page, bell, A/B of sample matches and
loop-match (change `notifications-page`); changes to the embedded cart player
(`mode='list'`).

## Decisions

- **Queue = source + snapshot, live when on screen.** Storing only a source key
  would lose the list when the user navigates away (e.g. a search is replaced);
  storing only a snapshot would miss paging and heard-state updates. Using the
  live list when the keys match and the snapshot otherwise covers both.
- **Pure `playQueue.js` module** so the rules are unit-tested without React.
- **Docked mode keeps the full Preview mounted but hidden** and adds a compact
  bar. Moving the `<audio>` element between two components would remount it
  and stop playback; hiding the full panel keeps one element alive.
- **Samples as track-like items** with `kind: 'sample'` and a `store: 'sample'`
  preview, so Preview's existing loading, waveform and media-session code plays
  them; track-only actions check `kind`.

## Risks / Trade-offs

- [Preview code assumes track fields] → sample items carry empty arrays for
  every list field Preview reads.
- [Fixed bar covers the bottom of Settings] → Settings gets bottom padding
  while the bar is visible.
- [Sample waveform generation needs CORS on the storage URL] → failure is
  already caught; the bar and progress work without a waveform.

## Migration Plan

Front-end only; ships with the next deploy. Rollback is a revert.

## Open Questions

None.
