## Why

The Fomo Player buttons injected on each Bandcamp track row currently
sit inside `.track-title` (or `.title-col`) and rely on a `margin-left:
8px` shim to separate them from the track title link. That shim was
applied to paper over the wrong DOM placement — the row's natural
horizontal flow already includes a `.time` span as the right anchor of
the title cell, and Bandcamp's existing styles align controls to that
spot. Mounting `[data-fp-injected]` after `.time` lets the row's own
layout handle the alignment, so the margin shim can go.

## What Changes

- In `injectReleaseLevelButtons`'s per-row loop, find the `.time` span
  inside the track row and insert the `[data-fp-injected]` wrap as the
  span's next sibling, falling back to the previous append-into-cell
  behaviour only when no `.time` span is present (e.g. unusual
  pre-release pages).
- Drop the `margin-left: 8px` from the wrap's inline style, since the
  new placement no longer needs the shim.

## Capabilities

### New Capabilities
<!-- none — extending bandcamp-track-actions -->

### Modified Capabilities
- `bandcamp-track-actions`: extend the per-row injection requirement to
  pin the placement of `[data-fp-injected]` immediately after `.time`
  on track rows, so the button row aligns with the row's natural
  layout without a left-margin shim.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/inject.js`:
  `injectReleaseLevelButtons` track-row loop changes the mount point;
  `buttonContainer` drops `margin-left: 8px`.
- No other surface (release title, discography tile, feed entry)
  changes — only the per-row placement.
- No backend, service-worker, or message-protocol changes.
- No new permissions, dependencies, or build steps.
