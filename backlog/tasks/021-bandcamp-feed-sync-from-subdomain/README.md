---
id: 021
title: Refactor Bandcamp feed sync so it can run from any Bandcamp subdomain
effort: M
created: 2026-05-05
---

# Refactor Bandcamp feed sync so it can run from any Bandcamp subdomain

## Why

The popup's "Feed" sync button is currently disabled whenever the active
tab is on an artist subdomain (`*.bandcamp.com` other than
`bandcamp.com`). The gate exists in `BandcampPanel.jsx` as
`disabled={running || !loggedIn || onSubdomain}` because the actual
feed-scrape implementation lives in the content script and issues
credentialed `fetch` calls against `https://bandcamp.com/api/...` and
`https://bandcamp.com/fan_dash_feed_updates`. From an artist subdomain
those calls are cross-origin from the page's perspective and the
browser's SameSite handling makes the credentialed POST unreliable, so
we hide the button rather than let it silently fail.

The user is most often on an artist subdomain when they want to sync —
that's where they discover music — so blocking the action there is a
real workflow papercut. The host-permission grant the extension already
holds (`https://*.bandcamp.com/*` in `manifest.base.json:15`) covers the
endpoints; we just need to issue the fetches from a context whose
origin is the extension instead of the artist subdomain.

## What

- Move `scrapeFeed` (currently in
  `packages/browser-extension/src/js/content/bandcamp.js:22-53`) into
  the background service worker. The worker can fetch
  `https://bandcamp.com/api/fan/2/collection_summary` and
  `https://bandcamp.com/fan_dash_feed_updates` with `credentials:
  'include'` regardless of which Bandcamp tab the user has open,
  because the request originates from the extension's origin and the
  manifest's host permissions cover `*.bandcamp.com`.
- Replace the `bandcamp:scrape-feed` content-script handler with a
  worker-side message handler the popup talks to directly (mirroring
  the way cart actions are dispatched today).
- Drop the `onSubdomain` gate from the Feed button in
  `packages/browser-extension/src/js/popup/BandcampPanel.jsx:134` once
  the worker path is in place. The button stays gated by `running` and
  `!loggedIn`.
- Keep the existing `reportProgress` / `releases` message stream the
  popup listens to; only the producer changes (worker, not content
  script). Page count default stays at 5.
- Preserve the wishlist-sync path as-is. It already runs on the
  wishlist DOM and is unrelated.

## Acceptance criteria

- [ ] On a logged-in tab pointing at an artist subdomain
      (`someartist.bandcamp.com`), opening the popup shows the Feed
      button enabled, and clicking it streams the feed updates without
      navigating away from the artist page.
- [ ] On a logged-in tab pointing at `bandcamp.com` (homepage,
      discover, fan dashboard, the user's feed), the Feed button is
      enabled and continues to work as before.
- [ ] On a logged-out tab (any Bandcamp surface), the Feed button is
      disabled — the gate is `!loggedIn`, not `onSubdomain`.
- [ ] The popup's progress indicator still updates while the worker
      fetches each page, matching the current UX.
- [ ] No new manifest permissions are added; the existing
      `https://*.bandcamp.com/*` host permission is sufficient.
- [ ] No regression in feed-sync output: the same `releases` payloads
      the content script previously emitted are emitted by the worker.

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp.js:22-53` —
  `scrapeFeed` to move out of the content script.
- `packages/browser-extension/src/js/content/bandcamp.js:95-98` —
  `bandcamp:scrape-feed` handler to delete (or leave as a thin
  forwarder if any caller still uses it).
- `packages/browser-extension/src/js/popup/BandcampPanel.jsx:72-84` —
  `sendFeed`; switch from `sendToActiveContent` to a direct
  `browser.runtime.sendMessage` to the worker.
- `packages/browser-extension/src/js/popup/BandcampPanel.jsx:134` —
  the Feed button's `disabled` expression; drop `onSubdomain`.
- `packages/browser-extension/src/manifest.base.json:13-15` — host
  permissions; no change expected.
- The background service-worker entry point — find the existing
  `bandcamp:*` worker handlers (cart actions, etc.) and add the
  feed-scrape handler alongside them.

## Out of scope

- Lifting the wishlist-sync gate. Wishlist sync reads the wishlist DOM
  on the active tab and only makes sense when the user is actually on
  their wishlist page; that's a different UX. File a separate item if
  needed.
- Reworking the popup's Feed-button progress UI.
- Anything related to login detection — that's covered by item 020 and
  is a prerequisite (this item assumes the popup correctly knows the
  tab's logged-in state on a subdomain).
- Adding caching, deduplication, or pagination tweaks to feed sync.

## Open questions

- Should the worker reuse a shared "Bandcamp API client" helper if one
  already exists, or stay inline like the current content script?
  Decide while reading the worker code; pick whichever keeps the diff
  smaller without leaving dead helpers behind.
- Are there any callers other than the popup that rely on the
  `bandcamp:scrape-feed` content-script message? Grep before deleting
  the handler.
