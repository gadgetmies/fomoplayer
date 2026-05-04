## Why

The clear-queue (`X`) button sits next to the queue-toggle button in the player view, where one stray click silently wipes the entire queue. Users have lost queues to a fat-finger click. Two compounding issues: the button is too close to a frequently-clicked target, and it has no confirmation gate.

## What Changes

- Remove the clear-queue (`X`) icon button from the player-view controls (next to the queue-toggle button). The player-view row no longer has a clear-queue affordance.
- Add a "Clear queue" button inside the queue panel itself, anchored as a footer below the list of queued tracks. Visible only while the queue panel is shown (the panel already toggles).
- Clicking the in-panel clear-queue button MUST prompt for confirmation before sending the `audio:clear` message. Cancelling leaves the queue intact.
- The split between the queue panel wrapper (which toggles visibility) and the rebuilt track list inside it lets the clear button persist across queue rebuilds.

## Capabilities

### Modified Capabilities
- `embedded-player-ui`: extend the embedded player spec with the placement and confirmation requirements for the clear-queue control.

## Impact

- `packages/browser-extension/src/js/content/bandcamp/player-ui.js` — markup (split queue panel wrapper from list), refs, click bindings, `rebuildQueue` (only rewrites the inner list, not the panel), `renderEmptyState` (hides the panel wrapper, not the list).
- No backend, API, or database changes.
- No test fixtures reference the X button.
