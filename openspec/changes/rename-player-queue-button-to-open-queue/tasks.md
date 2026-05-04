## 1. Update the player-view button

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/player-ui.js`, change the queue-toggle button's text content from "Queue" to "Open queue".
- [x] 1.2 Add `title="Open queue"` and `aria-label="Open queue"` to the same button.

## 2. Verify nothing else broke

- [x] 2.1 Run `yarn test` in `packages/browser-extension/` — should pass.
- [x] 2.2 Run a chrome build (`FRONTEND_URL=https://example.test yarn build:chrome`) — should succeed.
- [ ] 2.3 Manually load the extension and confirm the player-view button now reads "Open queue", hover shows the tooltip "Open queue", and per-track Bandcamp injection buttons still read "Queue" / "Queue track" / "Queue release".
