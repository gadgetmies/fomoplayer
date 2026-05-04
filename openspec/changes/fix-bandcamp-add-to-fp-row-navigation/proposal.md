## Why

On Bandcamp release pages (e.g. `https://offishproductions.bandcamp.com/album/plot-holes-vol-4`), clicking the injected "Add to Fomo Player" button next to a track navigates to the track's own page instead of adding the track. The click event is propagating to Bandcamp's row click handler, so the button silently fails to do its job — a regression that makes per-track adding from a release impossible.

## What Changes

- Stop the click on the "Add to Fomo Player" button from triggering Bandcamp's track-row navigation. The button must add the track without leaving the release page.
- Preserve the existing working behaviour on standalone track pages.

## Capabilities

### New Capabilities
- `bandcamp-track-actions`: Behaviour of the Fomo Player browser extension's per-track action buttons (currently "Add to Fomo Player") injected into Bandcamp release pages and track pages.

### Modified Capabilities
<!-- none — no existing specs -->

## Impact

- `packages/browser-extension/` — the click handler attached to the injected "Add to Fomo Player" button on Bandcamp release pages.
- No backend, API, or database changes.
