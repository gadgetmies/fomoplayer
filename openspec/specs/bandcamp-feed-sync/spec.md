# bandcamp-feed-sync Specification

## Purpose
TBD - created by archiving change bandcamp-feed-defensive-parse. Update Purpose after archive.
## Requirements
### Requirement: Feed parser guards the entries-array read site

The Bandcamp feed-sync parser SHALL verify that the response contains an
array of feed entries before iterating it. When the array is missing or
not an array, the parser SHALL throw a typed `FeedShapeError` carrying a
human-readable message rather than letting a property dereference throw
a generic `TypeError`.

#### Scenario: Response is missing the stories wrapper

- **WHEN** `scrapeFeed` parses a response body where `feed.stories` is
  `undefined`
- **THEN** the parser throws `FeedShapeError` with the message
  `"Bandcamp feed endpoint returned an unexpected shape — try re-logging
  in to bandcamp.com or file a bug."`
- **AND** no `TypeError` is raised before the typed error

#### Scenario: Response has stories but entries is not an array

- **WHEN** `scrapeFeed` parses a response body where
  `feed.stories.entries` is `null`, `undefined`, or a non-array value
- **THEN** the parser throws `FeedShapeError` with the same message
- **AND** no entries are forwarded to the worker for that page

#### Scenario: Response has the expected shape

- **WHEN** `scrapeFeed` parses a response body where
  `feed.stories.entries` is an array containing one or more `story_type:
  'nr'` entries
- **THEN** the parser filters entries to `story_type === 'nr'` and
  forwards the resulting array as a `releases` message to the worker
- **AND** advances `olderThan` to `feed.stories.oldest_story_date`

### Requirement: Feed-sync rejects non-JSON responses

The feed-sync request SHALL treat a `2xx` response that is not JSON
(typically an HTML login redirect rendered as `text/html`) as a failed
sync rather than parsing it. The parser SHALL throw `FeedShapeError`
with the same human-readable message used for shape mismatches, so the
popup surfaces a single recoverable error.

#### Scenario: Bandcamp redirects feed request to login HTML

- **WHEN** `fan_dash_feed_updates` returns 200 with
  `content-type: text/html; charset=utf-8`
- **THEN** the parser throws `FeedShapeError` before attempting to
  decode the body as JSON

#### Scenario: Response is JSON

- **WHEN** the response `content-type` starts with `application/json`
- **THEN** the parser proceeds to decode and validate the body

### Requirement: Feed-sync errors surface through the existing reportError path

The content script MUST report `FeedShapeError` (and any other error thrown during feed sync) via the existing `runtime.sendMessage({ type: 'error', message, stack })` path that the popup already listens to, so the user sees one human-readable line in the popup error UI.

#### Scenario: Parser throws while popup feed sync is in flight

- **WHEN** `scrapeFeed` throws any error
- **THEN** the content script forwards the error message and stack to
  the popup via the existing `reportError` helper
- **AND** the popup displays that message in its error UI without a
  raw stack trace

### Requirement: Parser is unit-tested against fixture shapes

A unit test SHALL exercise the parser logic against at least three
fixtures: the legacy "stories wrapper present" shape, a "missing
stories" shape, and a "stories present but entries non-array" shape.
The test SHALL fail if a future code change removes the defensive
guard.

#### Scenario: Test runs against happy-path fixture

- **WHEN** the test invokes the parser with a happy-path fixture
- **THEN** it returns the filtered `nr` entries and the expected next
  `olderThan` value

#### Scenario: Test runs against missing-field fixture

- **WHEN** the test invokes the parser with `feed.stories` missing
- **THEN** it throws `FeedShapeError` and does not throw `TypeError`

### Requirement: Feed-sync runs in the background worker

The background service worker MUST host the feed-sync flow end-to-end:
the popup sends a `bandcamp:scrape-feed` message to the worker, and
the worker fetches `https://bandcamp.com/api/fan/2/collection_summary`
and `https://bandcamp.com/fan_dash_feed_updates` with `credentials:
'include'` from its own origin. The content script SHALL NOT be the
producer of the feed-sync `releases` stream.

#### Scenario: Popup is on an artist subdomain

- **WHEN** the active tab points at `someartist.bandcamp.com` and the
  user clicks the Feed button
- **THEN** the worker performs both fetches successfully
- **AND** the popup receives the same `releases` and `operationStatus`
  messages it would have received with the active tab on
  `bandcamp.com`

#### Scenario: Popup is on bandcamp.com

- **WHEN** the active tab points at `bandcamp.com` (homepage,
  discover, fan dashboard, the user's own feed) and the user clicks
  the Feed button
- **THEN** the worker performs both fetches successfully and emits
  the same message stream as the subdomain case

### Requirement: Feed button is gated by login state, not subdomain

The popup's Feed button SHALL be disabled only while a sync is
running or while the user is logged out. The button MUST NOT depend
on the active tab's subdomain.

#### Scenario: Logged-in tab on artist subdomain

- **WHEN** the user opens the popup on
  `someartist.bandcamp.com` with a valid Bandcamp session
- **THEN** the Feed button renders enabled

#### Scenario: Logged-out tab on any Bandcamp surface

- **WHEN** the user opens the popup on any `*.bandcamp.com` tab and
  no Bandcamp session is detected
- **THEN** the Feed button renders disabled with the existing
  "Requires login" treatment

### Requirement: Worker reuses the defensive feed parser

The worker handler MUST call `parseFeedPage` and
`assertJsonContentType` from
`packages/browser-extension/src/js/content/bandcamp/feed-parse.js`
rather than re-implementing the parser. Any future shape mismatch
or non-JSON response SHALL surface as a `FeedShapeError` exactly
the way it did from the content-script path.

#### Scenario: Endpoint returns the legacy shape

- **WHEN** the worker handler receives a response with the expected
  `{ stories: { entries, oldest_story_date } }` shape
- **THEN** it forwards the filtered `nr` releases to the popup via
  the existing `releases` message stream and advances `older_than`
  with the parser's `nextOlderThan` value

#### Scenario: Endpoint returns an HTML login redirect

- **WHEN** the worker handler receives a 200 `text/html` response
  to its credentialed fetch
- **THEN** it throws `FeedShapeError` via `assertJsonContentType`,
  catches it, and reports the failure to the popup via the same
  `{ type: 'error', message, stack }` channel content-script errors
  used previously

### Requirement: No new manifest permissions

The worker-driven feed-sync flow MUST work using only the
permissions the manifest already declares. The change SHALL NOT add
any new host or API permissions to `manifest.base.json`.

#### Scenario: Manifest is unchanged

- **WHEN** the build emits the manifest
- **THEN** its `host_permissions` and `permissions` arrays are
  byte-identical to the pre-change build

