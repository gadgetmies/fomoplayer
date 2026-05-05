## Context

The popup's Bandcamp Feed sync runs inside a content script
(`packages/browser-extension/src/js/content/bandcamp.js`). Its
`scrapeFeed` function fetches `https://bandcamp.com/fan_dash_feed_updates`
with the user's cookies, expects a `{ stories: { entries, oldest_story_date } }`
JSON shape, filters entries where `story_type === 'nr'`, and forwards
the resulting releases to the worker via `runtime.sendMessage`.

The endpoint is not part of any official API contract. It has shifted
shape before, and is currently returning either a different shape or
an HTML response that the existing `feedResponse.ok` check accepts.
The parser then crashes on the unguarded `feed.stories.entries.filter(...)`
read.

A larger refactor (backlog item 021) will move these credentialed
fetches out of the content script and into the worker. That work
absorbs `scrapeFeed` and is the right place to redesign the parser
end-to-end. The current change is intentionally narrower: harden the
existing call site so users see an actionable error today.

## Goals / Non-Goals

**Goals:**

- Replace the unguarded `feed.stories.entries.filter(...)` access with
  a guard that throws a typed error.
- Reject `200 text/html` responses (login redirects) before they reach
  the JSON decoder.
- Surface a single human-readable popup error when either guard trips.
- Cover the parser with unit tests so a regression breaks CI before
  it breaks users.

**Non-Goals:**

- Moving `scrapeFeed` into the worker (item 021).
- Rewriting the popup error UI.
- Auto-recovering from a shape mismatch by guessing the new field
  paths — the right answer is "tell the user, log the diff, ship a
  parser update".
- Capturing a live response fixture from a real logged-in account —
  that requires the user to reproduce the failing flow and is tracked
  separately as an open question on the backlog item.

## Decisions

**Use a named `FeedShapeError` subclass of `Error`.** A typed error
makes the guard's intent obvious at the throw site and lets future
callers `instanceof`-check it (e.g. to attach store / page metadata
before reporting). An ad-hoc `new Error(...)` would work but conveys
less.

**Guard at the parse site, not at the fetch.** The same shape mismatch
can come from a 200/JSON response with a missing field *or* a
200/HTML response that we should never have decoded. Centralising
both checks in one validate-and-extract helper keeps the throw
behaviour identical.

**Tighten `ok` to also require JSON content-type.** `feedResponse.ok`
returns true for 200/text/html login redirects. We pre-check
`Content-Type` against `/^application\/json/i` and short-circuit to a
`FeedShapeError` if it does not match, before any `await
feedResponse.json()` call (which would itself throw a generic
`SyntaxError` on HTML).

**Extract a pure `parseFeedPage(feed)` helper.** Pulling parsing out
of the async loop makes the function unit-testable without mocking
`fetch`, `runtime`, or progress reporting. The loop becomes:
`const { releases, nextOlderThan } = parseFeedPage(feed)`.

**Keep `reportError` as the surface.** The popup already listens for
`{ type: 'error', message, stack }` runtime messages. We don't add a
new message type — we just make sure the typed error reaches the
existing handler with a clean message.

## Risks / Trade-offs

- **Risk: the captured shape on the user's account is not the one we
  fixture against** → Mitigation: ship the guard + popup-error path
  even before the live fixture is captured; the guard guarantees an
  actionable error rather than a crash. The fixture is a follow-up
  improvement, not a precondition for shipping the fix.
- **Risk: the JSON content-type check is too strict and blocks a
  legitimate success response that uses `application/json;
  charset=utf-8` or odd casing** → Mitigation: match
  `/^application\/json/i` (case-insensitive prefix) so the parameter
  list and casing don't matter.
- **Trade-off: we don't try to *recover* from a shape mismatch by
  probing alternative field paths.** A guesser would be brittle and
  would mask real shifts. Failing loudly with a clear message is
  better — it pages a human to update the parser.

## Migration Plan

No data migration. Ship as a normal extension build. Users on the
broken endpoint will see the new popup error instead of a crash; users
on a working endpoint see no behavioural change (the happy-path code
runs first and returns before the guard's error path is reached).

## Open Questions

- Does the new shape carry `oldest_story_date` under the same path
  when present, or has it moved? Resolved by capturing a live fixture
  in a follow-up; the guard does not need to know.
- Should the popup show a one-shot "Re-login to Bandcamp" affordance
  on `FeedShapeError`? Out of scope here — UI surface lives in the
  popup, and we're not changing it in this change.
