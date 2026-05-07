## 1. Parser hardening in content script

- [x] 1.1 Add a `FeedShapeError` class (subclass of `Error`) — defined in the new `packages/browser-extension/src/js/content/bandcamp/feed-parse.js` module so it is importable from tests; re-used from the content script via ESM import.
- [x] 1.2 Extract a pure `parseFeedPage(feed)` helper that validates `feed.stories.entries` is an array, throws `FeedShapeError` with the agreed message when it is not, and returns `{ releases, nextOlderThan }` on the happy path.
- [x] 1.3 Update `scrapeFeed` in `packages/browser-extension/src/js/content/bandcamp.js` to call `parseFeedPage(feed)` instead of dereferencing `feed.stories.entries` / `feed.stories.oldest_story_date` inline.
- [x] 1.4 Before `await feedResponse.json()`, call `assertJsonContentType(feedResponse.headers.get('content-type'))` to throw `FeedShapeError` when the response is not JSON — catches HTML login redirects that `feedResponse.ok` lets through.

## 2. Error surfacing

- [x] 2.1 Verified the existing `reportError` path is reached: the `runtime.onMessage` handler in `bandcamp.js:85-108` already wraps `scrapeFeed` in `try/catch` and forwards thrown errors via `reportError(...)`. `FeedShapeError.message` propagates verbatim.
- [x] 2.2 Confirmed the popup error UI rendering path is unchanged — `FeedShapeError` flows through the same `{ type: 'error', message, stack }` channel as every other content-script error, so the popup renders the message verbatim with no stack.

## 3. Tests

- [x] 3.1 Added `packages/browser-extension/test/feed-parse.spec.js` covering happy-path, missing `stories`, `stories.entries` non-array (null / string / object), and the JSON content-type guard.
- [x] 3.2 `parseFeedPage` and `assertJsonContentType` are exported from a CommonJS sibling module (`feed-parse.js`) so the test requires it without pulling in webextension-polyfill.
- [x] 3.3 `yarn test` in `packages/browser-extension` — 13 passing (5 new parser specs + 5 new content-type specs + 3 pre-existing transform specs).

## 4. Build verification

- [x] 4.1 `FRONTEND_URL=https://example.com yarn build:chrome` — webpack compiled successfully in 4.7s, no lint / type regressions.
- [x] 4.2 No additional smoke test needed — webpack build output is clean.
