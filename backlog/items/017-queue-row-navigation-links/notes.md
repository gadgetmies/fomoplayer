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
- _2026-05-05_ — Extended `buildQueueItemsFromReleases` in
  `packages/browser-extension/src/js/service_worker.js` to derive
  `trackUrl` (origin of `release.url` joined with `track.title_link`,
  fallback `releaseUrl`), `artistUrl` (origin of `release.url`), and
  `labelUrl` (best-effort `release.current?.label_url ||
  release.label_url`, omitted when equal to `artistUrl`). The
  embedded player's `rebuildQueue` (`player-ui.js`) renders the
  links as a small muted row under the artist line via a new
  `buildQueueLinks(q)` helper, and the row click handler picks up
  an `if (e.target.closest('a')) return` guard alongside the
  existing `[data-remove]` guard so plain link clicks navigate the
  current tab and modifier-clicks open in new tabs without
  triggering `audio:play-at`. Build (`yarn build:chrome`) passes.
