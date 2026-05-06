## 1. CSS update

- [x] 1.1 The `[data-fp-injected]` wrap's inline `cssText` in `packages/browser-extension/src/js/content/bandcamp/inject.js` no longer declares `background: rgba(0, 0, 0, 0.45)`. The `box-shadow` is now `0 2px 12px 4px rgba(0, 0, 0, 0.45)`. `border-radius: 6px`, padding, and flex declarations are unchanged.

## 2. Verification

- [x] 2.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles cleanly.
- [x] 2.2 `yarn test` — 13 specs pass.
