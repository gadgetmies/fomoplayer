## Why

Each row in the embedded player's queue panel renders track and
artist as plain text. The only click target on the row is "play that
track". If the user wants to open the source page for a queued item
— to read the description, buy the release, follow the artist, or
browse the label's catalogue — there's no path from the queue: they
have to remember where the track came from and re-find it on
Bandcamp. The queue is the canonical "things I've decided to listen
to" list, so following up on a track should be one click away.

## What Changes

- Extend the queue item shape produced by `buildQueueItemsFromReleases`
  in `service_worker.js` with `trackUrl`, `artistUrl`, and
  `labelUrl` (when the release exposes a label distinct from the
  artist). `releaseUrl` is already there.
- In `rebuildQueue` (`player-ui.js`), surface Track, Release, Artist
  and (when present) Label as inline `<a href="…">` links inside
  each queue row. Plain click navigates the current tab; standard
  modifier clicks (Cmd/Ctrl/middle, right-click) keep working so
  the user picks the target.
- Guard the row's existing "play this track" click handler against
  link clicks the same way it already guards against the remove
  button, so clicking a link does not change the active track or
  start playback.
- Skip the Label link when no label URL is available rather than
  rendering an inert placeholder.

## Capabilities

### New Capabilities
<!-- none — extending embedded-player-ui -->

### Modified Capabilities
- `embedded-player-ui`: extend the queue panel requirements with
  inline navigation links (Track / Release / Artist / optional
  Label) per row that respect default browser navigation and do not
  trigger the row's play action.

## Impact

- `packages/browser-extension/src/js/service_worker.js`:
  - `buildQueueItemsFromReleases` derives `trackUrl` (absolute URL
    from `release.url`'s origin + `track.title_link` or
    `track.title_url`), `artistUrl` (origin of `release.url`), and
    `labelUrl` (best-effort from
    `release.current?.label_url || release.label_url || null`,
    omitted when equal to `artistUrl`).
- `packages/browser-extension/src/js/content/bandcamp/player-ui.js`:
  - The CSS in `STYLE` adds `.qrow .qlinks` styling for an inline
    link row.
  - `rebuildQueue` renders the link row using `escapeHtml` for the
    href and label, only including each link when its URL is present.
  - The row click handler ignores clicks whose target is inside a
    link (`e.target.closest('a')` returns truthy) — the same shape
    as the existing `[data-remove]` guard.
- No backend, message-protocol breaking changes; new fields on the
  queue item are additive.
- No new permissions, dependencies, or build steps.
