## 1. CSS update

- [x] 1.1 The `[data-fp-injected]` wrap's inline `cssText` in `packages/browser-extension/src/js/content/bandcamp/inject.js` no longer carries the `box-shadow` declaration. Flex, padding, and `border-radius` remain.

## 2. Verification

- [x] 2.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles cleanly.
- [x] 2.2 `yarn test` — 13 specs pass.
