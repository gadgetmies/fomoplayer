## 1. CSS update

- [x] 1.1 The `[data-fp-injected]` wrap's inline `cssText` in `packages/browser-extension/src/js/content/bandcamp/inject.js` now declares `box-shadow: 0 0 8px 2px rgba(0, 0, 0, 0.45);` and no longer carries `backdrop-filter` / `-webkit-backdrop-filter` declarations. The wash and rounded corners are unchanged.

## 2. Verification

- [x] 2.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles cleanly.
- [x] 2.2 `yarn test` — 13 specs pass.
