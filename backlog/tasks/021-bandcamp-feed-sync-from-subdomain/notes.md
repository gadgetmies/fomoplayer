# Notes

## Decisions

- _2026-05-05_ — Filed as a follow-up to item 020. The feed button's
  `onSubdomain` gate is the right *temporary* behaviour while the
  scrape lives in the content script, but the proper fix is moving the
  fetches to the worker so the manifest's `https://*.bandcamp.com/*`
  host permission covers them.

## Rejected approaches

- _2026-05-05_ — Lifting the gate without moving the fetches. From an
  artist subdomain, `fetch('https://bandcamp.com/api/...',
  { credentials: 'include' })` is cross-origin from the page's
  perspective; the credentialed POST to `fan_dash_feed_updates` is
  unreliable across browsers. We need the request to originate from
  the extension's origin (the worker), not the page.

## Open threads

- Confirm whether any non-popup caller still issues
  `bandcamp:scrape-feed` to the content script. If not, the message
  type can be dropped entirely; if yes, keep a thin forwarder that
  `runtime.sendMessage`s to the worker.
- When implementing, look for an existing "Bandcamp API client" in the
  worker (cart / wishlist-sync code paths likely already touch
  `bandcamp.com/api/...`) so we don't duplicate fetch boilerplate.

## Session log

- _2026-05-05_ — Filed during item 020 review; user observed that the
  feed button is disabled on artist subdomains and asked for a refactor
  item to lift that restriction.
