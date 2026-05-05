## Context

`scrapeFeed` lives in `packages/browser-extension/src/js/content/bandcamp.js`
today and is invoked when the popup sends `bandcamp:scrape-feed` to
the active content script. The content script then issues credentialed
`fetch` against `https://bandcamp.com/...`. From an artist subdomain
that crosses page-origin boundaries and SameSite handling on the
session cookie sometimes drops it. The popup hides the Feed button on
subdomains rather than risk a silent failure.

The extension's worker (`service_worker.js`) already runs at the
extension's own origin and is the host for all the other `bandcamp:*`
operations: `bandcamp:enqueue`, `bandcamp:fetch-html`,
`bandcamp:report-heard`, `bandcamp:get-carts`, etc. Moving the feed
fetch there is the natural shape — the worker has the host permission
grant `https://*.bandcamp.com/*` and is unaffected by the active tab's
SameSite context.

The previous change (`bandcamp-feed-defensive-parse`) extracted the
parser into a sibling CommonJS module
(`content/bandcamp/feed-parse.js`). Both the content script and the
worker can import the same helpers, which is the wedge that makes the
move cheap.

## Goals / Non-Goals

**Goals:**

- Make Feed sync work from any `*.bandcamp.com` tab (including artist
  subdomains).
- Reuse the defensive parser without forking it.
- Keep the popup → progress / releases message stream unchanged so
  the popup UI does not need to re-learn the protocol.

**Non-Goals:**

- Removing the content-script `bandcamp:scrape-feed` handler
  entirely. We leave it as a no-op forwarder for one release in case
  any other surface still calls it; deletion is a follow-up.
- Reworking the popup progress UI.
- Adding caching, dedup, or pagination tweaks.
- Touching wishlist sync — it lives on the page DOM and is unrelated.
- Adding new manifest permissions.

## Decisions

**Send the result message stream from the worker on behalf of the
popup.** The popup already listens to `runtime.onMessage` for
`{ type: 'releases', store: 'bandcamp', ... }` and
`{ type: 'operationStatus', ... }`. The worker can broadcast those
messages via `browser.runtime.sendMessage`, which the popup picks up
the same way it did when the producer was the content script.

**Worker imports the parser via require / ES interop.** The parser
module is CommonJS; webpack bundles the worker the same way it
bundles the content script. `import { parseFeedPage,
assertJsonContentType } from './content/bandcamp/feed-parse'` works
from either entry point.

**Drop only the `onSubdomain` gate, keep `running` and `loggedIn`.**
The Feed button still needs the running guard (don't double-fire) and
the login guard (don't fetch with no cookie). The subdomain guard was
a workaround for the cross-origin issue and is no longer needed.

**Leave the content-script handler in place as a forwarder.** Deleting
it would simplify the diff but risks breaking anything still calling
into it (other extensions, future panels, manual testing). The body
becomes `return browser.runtime.sendMessage({ type:
'bandcamp:scrape-feed', pageCount: message.pageCount })` — a thin
shim. Removal goes on the cleanup queue once the worker path has
been in production for one release.

## Risks / Trade-offs

- **Risk: the worker's credentialed fetch hits a different cookie
  jar than the content script's** → Mitigation: extension-origin
  fetches share the user's cookie jar for any host the manifest's
  `host_permissions` covers, and `*.bandcamp.com` is already on the
  list. The worker is the same origin as the rest of the extension's
  Bandcamp operations, all of which work today.
- **Risk: the popup's `runtime.onMessage` listener doesn't pick up
  the worker's broadcasts because the worker is the sender** →
  Mitigation: `runtime.sendMessage` from the worker reaches every
  other listener (popup, content scripts) but not the worker
  itself. The popup is a separate listener context, so it receives
  these. This is the same pattern `bandcamp:report-heard` uses today.
- **Trade-off: leaving the content-script handler in place adds a
  small amount of dead code** → It's a 1-line forwarder; deletion is
  a clean follow-up after one release.

## Migration Plan

No data migration. Ship as a normal extension build. The popup's
behavior is identical from the user's perspective except that the
Feed button is now enabled on artist subdomains.

Rollback: revert the diff. Both old and new paths use the same
`releases` message contract, so partial rollouts (e.g. some popups on
old code, some on new) interleave safely — no in-flight sync gets
half-applied.

## Open Questions

- Is anyone other than `BandcampPanel.jsx` calling
  `bandcamp:scrape-feed`? Grep before deletion in the cleanup
  follow-up. The popup is the only known caller in this repo.
- Does the worker need its own `reportProgress` helper? We can
  inline `runtime.sendMessage({ type: 'operationStatus', ... })` —
  the helper in the content script is one line.
