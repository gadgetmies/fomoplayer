## ADDED Requirements

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
