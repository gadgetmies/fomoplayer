## 1. Update the player-view button

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/player-ui.js`, set the queue-toggle button's initial text, `title`, and `aria-label` to "Show queue".
- [x] 1.2 Add a `syncQueueToggleLabel` helper that reads the `hidden` class on the queue panel and writes "Show queue" / "Hide queue" into the button's text, `title`, and `aria-label`.
- [x] 1.3 Call `syncQueueToggleLabel` after the toggle click and inside `renderEmptyState` so the label always reflects panel visibility.

## 2. Verify nothing else broke

- [x] 2.1 Run `yarn test` in `packages/browser-extension/` — should pass.
- [x] 2.2 Run a chrome build (`FRONTEND_URL=https://example.test yarn build:chrome`) — should succeed.
- [ ] 2.3 Manually load the extension and confirm: button starts as "Show queue"; clicking shows the panel and flips the label to "Hide queue"; clicking again hides the panel and flips back to "Show queue"; per-track Bandcamp injection buttons still read "Queue" / "Queue track" / "Queue release".
