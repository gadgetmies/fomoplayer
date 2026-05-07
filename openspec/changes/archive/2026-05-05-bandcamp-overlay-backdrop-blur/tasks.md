## 1. CSS update

- [x] 1.1 `buttonContainer()` in `packages/browser-extension/src/js/content/bandcamp/inject.js` now sets `background: rgba(0, 0, 0, 0.45)` (was 0.55) and adds `backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);` to the inline `cssText`.

## 2. Verification

- [x] 2.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles cleanly.
- [x] 2.2 `yarn test` — 13 specs pass.
