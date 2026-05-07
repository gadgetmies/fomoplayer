## Why

The popup's "Feed" sync button is currently disabled whenever the
active tab is on a Bandcamp artist subdomain (`*.bandcamp.com` other
than `bandcamp.com`). That gate exists because the feed-scrape lives
in a content script and issues credentialed `fetch` calls against
`https://bandcamp.com/api/...` — from an artist subdomain those calls
are cross-origin from the page's perspective and the browser's
SameSite handling makes the credentialed POST unreliable, so the
popup hides the button rather than let it silently fail.

The user is most often on an artist subdomain when they want to sync
new releases — that's where they discover music — so blocking the
action there is a real workflow papercut. The host-permission grant
the extension already holds (`https://*.bandcamp.com/*` in
`manifest.base.json`) covers the endpoints; the fix is to issue the
fetches from the worker instead of the page-origin content script.

## What Changes

- Move `scrapeFeed` from the content script
  (`packages/browser-extension/src/js/content/bandcamp.js`) into the
  background service worker. The worker runs at the extension's
  origin, so credentialed `fetch` against `bandcamp.com` works
  uniformly regardless of which `*.bandcamp.com` tab the user has
  open.
- Add a `bandcamp:scrape-feed` worker handler the popup can talk to
  directly via `browser.runtime.sendMessage`. The handler reuses the
  existing `parseFeedPage` / `assertJsonContentType` helpers from
  `content/bandcamp/feed-parse.js` so the defensive parsing gained in
  the previous change carries over verbatim.
- Replace the popup's `sendToActiveContent({ type:
  'bandcamp:scrape-feed' })` with a direct `browser.runtime.sendMessage`
  call to the worker.
- Drop the `onSubdomain` gate from the Feed button. The button stays
  gated by `running` and `!loggedIn`.
- Keep the existing `reportProgress` / `releases` message stream the
  popup listens to; only the producer changes (worker, not content
  script). Page count default stays at 5.
- Leave the content-script `bandcamp:scrape-feed` handler in place
  but unused — to be removed in a follow-up after a smoke-test
  window confirms no other caller depends on it.

## Capabilities

### New Capabilities

<!-- none — this change extends an existing capability. -->

### Modified Capabilities

- `bandcamp-feed-sync`: feed-sync is now driven by the background
  service worker, not the content script. The popup talks to the
  worker directly; the parser code is shared via the
  `feed-parse` module.

## Impact

- `packages/browser-extension/src/js/service_worker.js` — new
  `bandcamp:scrape-feed` handler that reuses the existing parse
  helpers and forwards `releases` / progress messages.
- `packages/browser-extension/src/js/content/bandcamp.js` — content
  script's `scrapeFeed` and `bandcamp:scrape-feed` case become
  no-op forwarders or are deleted; defensive parser stays in
  `feed-parse.js`.
- `packages/browser-extension/src/js/popup/BandcampPanel.jsx` —
  `sendFeed` switches from `sendToActiveContent` to
  `browser.runtime.sendMessage`; Feed button drops the
  `onSubdomain` gate.
- No new manifest permissions. No backend changes. No new
  dependencies.
