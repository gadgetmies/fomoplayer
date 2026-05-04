## Why

In the browser extension's embedded player UI, the button that toggles the queue panel is labelled "Queue". The same word also labels the per-track buttons we inject into Bandcamp pages, where it means "add this track to the queue" (a verb). Two buttons with the same label and opposite meanings — one *toggles* the queue panel, the others *append to* it — confuses users. Relabelling the player-view button as "Show queue" / "Hide queue" — driven by the panel's current visibility — disambiguates and tells the user what clicking will do.

## What Changes

- The player-view queue-toggle button shows "Show queue" while the queue panel is hidden and "Hide queue" while it is visible.
- The button's `title` and `aria-label` track the visible label.
- The per-track Queue buttons injected on Bandcamp release/track/discography pages keep their current "Queue" / "Queue track" / "Queue release" labels — they mean "add to queue" and are out of scope.
- The empty-state hint that reads `Click "Queue" next to a Bandcamp track or release` still refers to the (unchanged) per-track injection labels, so it stays as-is.

## Capabilities

### New Capabilities
- `embedded-player-ui`: the in-page Fomo Player UI the browser extension injects into Bandcamp pages — its labels, controls, and accessibility wiring. Currently undocumented; this change introduces the spec covering the queue-toggle label.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/player-ui.js` — the queue-toggle button markup, the toggle click handler, and the empty-state reset path.
- No backend, API, or database changes.
- No test fixtures reference the old label (verified by grep).
