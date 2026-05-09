## Why

The desktop refresh button on the tracks view was removed in commit
`78fda47d feat: replace refresh button with pull-to-refresh`, which
shipped pull-to-refresh as the sole way to refresh the list. Pull-to-
refresh requires a touch gesture, so on desktop / mouse-driven devices
there is now no in-app way to refresh the track list — the user has to
reload the whole page, losing scroll position, queue focus, and other
transient state. That is a regression on the primary action of the
primary view, hitting every desktop user.

## What Changes

- Add a refresh control on the tracks view (`new`, `recent`, `heard`)
  that is visible on non-touch / mouse-driven devices and triggers the
  same refresh path that pull-to-refresh already drives
  (`refreshTracks` → `onUpdateTracksClicked`).
- Detect "non-touch" via the `(hover: hover) and (pointer: fine)` media
  query. If the heuristic is uncertain (hybrid devices that match both
  touch and fine pointer), prefer to show the button — the duplicate
  affordance is uglier than leaving a desktop user stuck.
- The button reflects the in-flight refresh state: it is disabled and
  shows a spinner while `state.updatingTracks` is true, and re-enables
  when the refresh resolves or fails. This reuses the existing
  `updatingTracks` flag — no parallel loading state.
- Pull-to-refresh continues to work unchanged on touch devices.

## Capabilities

### New Capabilities

- `tracks-view-refresh-control`: When and how the user can manually
  refresh the tracks view, the affordances exposed for touch vs.
  non-touch input, and the in-flight feedback the refresh control must
  expose.

### Modified Capabilities

<!-- None — pull-to-refresh and the underlying refresh action are
already in the codebase but not previously specified. The new
capability covers both the existing gesture and the restored button as
two affordances of the same action. -->

## Impact

- `packages/front/src/Tracks.js` — gating helper, button render in the
  tracks-view header area, and the existing `refreshTracks()` /
  `isPullToRefreshAvailable()` neighbourhood.
- No backend, API, schema, or extension changes. No new dependencies.
- Behaviour change is additive on desktop; touch behaviour unchanged.
