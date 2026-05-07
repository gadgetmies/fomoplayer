---
id: 024
title: Bandcamp feed sync throws "Cannot read properties of undefined (reading 'entries')"
effort: S
created: 2026-05-05
---

# Bandcamp feed sync throws "Cannot read properties of undefined (reading 'entries')"

## Why

Triggering the popup's Bandcamp Feed sync from a logged-in tab fails
with:

```
TypeError: Cannot read properties of undefined (reading 'entries')
    at chrome-extension://<id>/content-bandcamp.bundle.js:1:43193
    at async chrome-extension://<id>/content-bandcamp.bundle.js:1:42567
```

The throw site corresponds to line 44 of
`packages/browser-extension/src/js/content/bandcamp.js`, where
`scrapeFeed` does:

```js
const newReleases = feed.stories.entries.filter(({ story_type: storyType }) => storyType === 'nr')
```

`feed.stories` is undefined, so reading `.entries` throws. Either
Bandcamp's `https://bandcamp.com/fan_dash_feed_updates` endpoint
returns a different shape than the code assumes (most likely — the
endpoint isn't part of any official API contract and has changed
shape before), or the request now returns an empty / error-shaped
response when called from the content script context (cookie /
SameSite changes, rate limiting, anti-bot etc.) but `feedResponse.ok`
still returns truthy. Either way the code currently has zero
defensive handling for "the endpoint changed shape" and surfaces a
mid-loop crash instead of an actionable error.

This is a P1 bug because the Feed sync is one of the popup's two
primary sync paths and is currently completely broken. Item 021
already proposes moving the credentialed feed-scrape fetches into
the worker, which is the right long-term fix; but the user is
broken *today*, so this item is for a small, targeted fix that:

1. Logs / surfaces the actual response shape so we know what
   Bandcamp returns now (and can update the parser if the contract
   has shifted).
2. Adds a defensive guard at the parse site so a missing
   `stories` (or `stories.entries`) yields a clear "feed format
   changed, see logs" error in the popup instead of a `TypeError`
   buried in the bundle.

## What

- Reproduce on a logged-in `bandcamp.com` tab by clicking the popup's
  Feed button. Capture the actual response body of the first
  `fan_dash_feed_updates` POST (Network tab → Response, OR add a
  one-shot `console.log(JSON.stringify(feed))` inside `scrapeFeed`)
  and store it under `temp/bandcamp-feed-response.json` so future
  sessions have the reference shape.
- Update the parser in
  `packages/browser-extension/src/js/content/bandcamp.js:32-52`
  according to whatever the captured shape shows:
  - **If the field moved** (e.g. response is now `{ entries: [...],
    oldest_story_date }` without the `stories` wrapper, or `stories`
    is now `feed_updates`), update the property paths and adjust
    `olderThan` accordingly.
  - **If the response is an error shape** (HTML login redirect, JSON
    error envelope, empty body), bail out early with a clear popup
    error: `"Bandcamp feed endpoint returned an unexpected shape — try
    re-logging in to bandcamp.com or file a bug."`.
  - **In either case**, before reading `feed.stories.entries`, guard
    with `Array.isArray(feed?.stories?.entries)` (or whatever path
    the new shape uses) and throw a *typed* error with a clear
    message rather than letting the dereference crash through.
- Reuse the existing `reportError` path so the failure surfaces in
  the popup error UI instead of just the console.
- Add a small unit-style test (or extend the existing
  `test/transforms.spec.js`) that exercises the parser against a
  fixture mirroring the captured response shape, so a future
  endpoint shift is caught before users see it.

## Acceptance criteria

- [ ] On a logged-in Bandcamp tab, clicking Feed sync no longer
      throws a `TypeError`. Either the sync completes successfully
      (if the endpoint returned a usable shape) or the popup
      surfaces a single, human-readable error explaining what
      happened.
- [ ] The captured response shape is committed to
      `temp/bandcamp-feed-response.json` so the next time the
      endpoint shifts, the diff is visible.
- [ ] The parser has a defensive guard at the
      `feed.stories.entries` (or its successor path) read site —
      no more raw `feed.stories.entries.filter(...)`.
- [ ] At least one test exercises the parser against the captured
      fixture; the test fails if the parser tries to dereference a
      missing field without the guard.
- [ ] No regression to other Bandcamp content-script paths
      (release-page scrape, wishlist sync, per-track injection).

## Code pointers

- `packages/browser-extension/src/js/content/bandcamp.js:22-53` —
  `scrapeFeed`. Lines 44 (`feed.stories.entries.filter(...)`) and 51
  (`olderThan = feed.stories.oldest_story_date`) are the unsafe
  accesses.
- `packages/browser-extension/src/js/content/bandcamp.js:11-15` —
  `reportError`. Use this to surface the typed error to the popup.
- `packages/browser-extension/test/transforms.spec.js` — existing
  mocha suite to extend (or add a sibling `feed-parse.spec.js`).
- Backlog item 021 — the eventual move-fetches-to-worker refactor.
  This bug fix is intentionally narrower; item 021 will absorb the
  parser when it ports `scrapeFeed` into the worker.

## Out of scope

- Moving the fetches into the worker — that's item 021. This item
  is a hot-fix on the existing content-script path so users aren't
  blocked while 021 is being designed.
- Reworking the feed UX (e.g. partial sync, incremental progress).
- Touching the unrelated `bandcamp:scrape-current-page` /
  wishlist-sync paths.

## Open questions

- Is the new endpoint shape consistent across logged-in users and
  feed sizes, or does it vary (e.g. empty feed → empty array
  vs. missing `stories`)? Capture multiple feeds during repro if
  possible.
- Does the Network tab show a non-200 / redirected response that
  `feedResponse.ok` is still treating as ok? If so, tighten the
  ok-check (`feedResponse.headers.get('content-type')`) before
  parsing.
