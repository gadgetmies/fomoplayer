## Why

In the browser extension's embedded player UI, the button that opens the queue panel is labelled "Queue". The same word also labels the per-track buttons we inject into Bandcamp pages, where it means "add this track to the queue" (a verb). Two buttons with the same label and opposite meanings — one *opens* the queue, the others *append to* it — confuses users. Renaming the player-view button to "Open queue" disambiguates without disturbing the per-track add-to-queue affordances.

## What Changes

- The player view's queue-toggle button label changes from "Queue" to "Open queue".
- The button gains `title` and `aria-label` of "Open queue" so the accessible name agrees with the visible label.
- The per-track Queue buttons injected on Bandcamp release/track/discography pages keep their current "Queue" / "Queue track" / "Queue release" labels — they mean "add to queue" and are out of scope.
- The empty-state hint that reads `Click "Queue" next to a Bandcamp track or release` still refers to the (unchanged) per-track injection labels, so it stays as-is.

## Capabilities

### New Capabilities
- `embedded-player-ui`: the in-page Fomo Player UI the browser extension injects into Bandcamp pages — its labels, controls, and accessibility wiring. Currently undocumented; this change introduces the spec covering the queue-toggle label.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/player-ui.js` — the queue-toggle button markup.
- No backend, API, or database changes.
- No test fixtures reference the old label (verified by grep).
