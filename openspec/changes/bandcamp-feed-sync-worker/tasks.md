## 1. Worker handler

- [x] 1.1 Added `scrapeFeedFromWorker({ pageCount })` in `packages/browser-extension/src/js/service_worker.js` that issues both fetches with `credentials: 'include'`, calls `setStatus(...)` for progress, and forwards releases via the new `ingestBandcampFeedReleases({ data, done })` helper (which directly mutates `bandcampReleases` and triggers `fetchNextBandcampItem` on the final page).
- [x] 1.2 Imported `parseFeedPage` and `assertJsonContentType` from `./content/bandcamp/feed-parse` at the top of the worker.
- [x] 1.3 Added the `bandcamp:scrape-feed` case to `handleMessage`. On error it calls `handleError({ message, stack })` (the same path other worker errors use) and returns `{ ok: false, error }`.
- [x] 1.4 Worker errors flow through `handleError` → `broadcast({ type: 'error', ... })`, the same channel the popup error UI already listens to.

## 2. Popup wiring

- [x] 2.1 `BandcampPanel.sendFeed` now calls `browser.runtime.sendMessage({ type: 'bandcamp:scrape-feed', pageCount: 5 })` directly to the worker instead of `sendToActiveContent`.
- [x] 2.2 The Feed button's `disabled` expression dropped `onSubdomain`; only `running || !loggedIn` remain. The unused `onSubdomain` state and probe assignment were also removed.
- [x] 2.3 Probe call still returns `onSubdomain` for any other future caller; the popup just doesn't bind to it.

## 3. Content-script forwarder

- [x] 3.1 The content-script `bandcamp:scrape-feed` case is now a single `sendToWorker(...)` forwarder so any caller still using `tabs.sendMessage` to the content script falls through to the worker handler.
- [x] 3.2 Deleted the now-unused `scrapeFeed` function, `reportProgress` helper, and `assertJsonContentType` / `parseFeedPage` imports from `content/bandcamp.js`. The parse helpers stay in their own module and are imported only by the worker.

## 4. Verification

- [x] 4.1 `yarn test` in `packages/browser-extension` — 13 specs pass (parser + content-type + transforms).
- [x] 4.2 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiles successfully in ~3s, no lint or import errors from the worker pulling in the parser module.
- [x] 4.3 `manifest.base.json` is byte-identical to the pre-change tree (verified via `diff` against `HEAD`).
