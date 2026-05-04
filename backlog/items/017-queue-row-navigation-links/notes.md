# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-04_ — Scope: queue panel rows only. Player-view metadata strip
  (currently has only a release link) is a related but separate concern.
- _2026-05-04_ — Label link appears only when the source distinguishes
  label from artist (true on Bandcamp). Don't render an inert placeholder.
- _2026-05-04_ — Links navigate in the **current tab** by default; render
  as plain `<a href="...">` so the user can Cmd/Ctrl-click or middle-click
  to open in a new tab themselves. Avoid `target="_blank"` — let the user
  choose the target rather than forcing one.

## Rejected approaches

- _(none yet)_

## Open threads

- Visual density of three or four inline links per row — see README "Open
  questions".
- Coordination with `fomoplayer_shared` track shape so the web frontend's
  queue can pick up the same fields without divergence.
- Consistency with the existing player-view release link (`player-ui.js`
  has a `target="_blank"` release link in the metadata strip). Revisiting
  that to match the queue-row default (current tab) is a separate decision
  — the existing link's behaviour is out of scope for this item, but worth
  flagging if we want a single rule across the embedded player.

## Session log

- _2026-05-04_ — Item filed in response to user feedback that the queue
  is a dead-end for following up on a queued track / release / artist /
  label.
