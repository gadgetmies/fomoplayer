## ADDED Requirements

### Requirement: Feed-sync ingests the followed-artists "New Releases" panel

In addition to `fan_dash_feed_updates`, the worker-driven feed-sync flow SHALL fetch `https://bandcamp.com/<username>/feed` once per sync run and ingest releases from the **"New Releases from artists you follow"** panel embedded in that page. The panel data lives inside `<div id="new-releases-vm">` as `data-item-json` attributes on `<li class="new-release …">` elements.

The username SHALL be discovered by the worker as follows: read `username` from the `collection_summary` body if present (`collectionBody.fan?.username` or `collectionBody.username`); otherwise fetch `https://bandcamp.com/` (the logged-in dashboard) and parse `identities.fan.username` from the `<div id="pagedata" data-blob="…">` JSON blob. If neither path yields a username, the worker SHALL throw the existing "logged out from worker context" error rather than guessing.

The parser SHALL ingest every `<li class="new-release …">` item present in the page regardless of CSS visibility. Bandcamp collapses overflow behind a "show more new releases" toggle by setting `display: none` on items past the visible cutoff, but every item is fully present in the server-rendered DOM with its complete `data-item-json` blob. Initially-hidden releases SHALL be ingested on the same footing as initially-visible ones.

#### Scenario: Panel contains releases not present in fan_dash_feed_updates

- **WHEN** the rendered feed page contains panel items whose `item_url` does not appear in any `fan_dash_feed_updates` response in the same sync run
- **THEN** those items are forwarded to the popup as part of the same `releases` message stream that the existing `nr` entries flow through
- **AND** they are accumulated by `ingestBandcampFeedReleases` like any other release, so the existing per-release tab-scrape continues to drive ingestion

#### Scenario: Panel includes items hidden behind "show more"

- **WHEN** the rendered feed page contains 40 `<li class="new-release …">` items in `<div id="new-releases-vm">` and the page's CSS collapses items past the initial cutoff (e.g. by setting `display: none`) until the user clicks "show more new releases"
- **THEN** the parser yields all 40 items, including the initially-hidden ones, and they are forwarded to the popup as part of the combined `releases` stream

#### Scenario: Panel is empty

- **WHEN** the feed page renders with `<div id="new-releases-vm">` present but no `<li class="new-release">` items
- **THEN** the parser returns an empty release list without throwing
- **AND** the paginated `fan_dash_feed_updates` loop runs and emits its own results unchanged

### Requirement: Releases on custom artist domains are filtered out

Both the panel parser output and the `fan_dash_feed_updates` parser output SHALL be filtered to releases whose `item_url` host is on `*.bandcamp.com` before being forwarded to the worker's accumulator. Releases on custom artist domains (e.g. `shallnotfade.co.uk`) SHALL be dropped silently from the release stream, with a single per-source `console.warn` reporting the dropped count, because the per-release tab scrape (`browser.scripting.executeScript`) requires manifest host permissions that are deliberately scoped to `*.bandcamp.com` only. The change SHALL NOT introduce broader host permissions to "fix" this — adding `<all_urls>` would be a user-visible privilege escalation outside the scope of the feed-sync work.

#### Scenario: Panel item has a custom-domain item_url

- **WHEN** the followed-artists panel returns an item whose `item_url` host is not `*.bandcamp.com` (e.g. `https://shallnotfade.co.uk/album/back-2-earth`)
- **THEN** the worker drops that item from the release stream before passing it to `ingestBandcampFeedReleases`
- **AND** the worker emits a single `console.warn` summarising the dropped count for that sync run, source-tagged ("panel" vs "fan_dash_feed_updates")
- **AND** other (non-custom-domain) panel items are forwarded unchanged

#### Scenario: fan_dash_feed_updates entry has a custom-domain item_url

- **WHEN** a `story_type === 'nr'` entry in `fan_dash_feed_updates` carries an `item_url` host that is not `*.bandcamp.com`
- **THEN** the worker drops that entry from the release stream before passing it to `ingestBandcampFeedReleases`
- **AND** the worker emits a `console.warn` summarising the dropped count for that page

### Requirement: Combined release stream is deduplicated

When the same release appears in both the followed-artists panel and the `fan_dash_feed_updates` paginated response, it SHALL appear in the worker's emitted release stream **exactly once**. Deduplication SHALL key on `item_url`; if `item_url` is missing on either side, it SHALL fall back to `item_id`. The first occurrence wins, with the panel fetched before the paginated loop so panel items take precedence on overlap.

#### Scenario: Same item_url in both sources

- **WHEN** a release with `item_url == "https://liquicity.bandcamp.com/album/magic"` appears both in the followed-artists panel and in a `fan_dash_feed_updates` page
- **THEN** the worker's accumulated `bandcampReleases` array contains exactly one entry for that `item_url`

#### Scenario: Same item_id but missing item_url on one side

- **WHEN** two source entries share `item_id` but only one has a non-empty `item_url`
- **THEN** the worker's accumulated `bandcampReleases` array contains exactly one entry for that `item_id`

### Requirement: Panel fetch failure surfaces as FeedShapeError

A panel fetch that returns non-2xx, returns HTML missing the `<div id="new-releases-vm">` marker (e.g. a login redirect), or returns a body where every panel item fails JSON validation SHALL throw `FeedShapeError` with the same human-readable message used by `parseFeedPage`. The error SHALL be reported to the popup via the same `{ type: 'error', message, stack }` channel content-script and worker errors already use.

#### Scenario: Feed page returns a login HTML redirect

- **WHEN** the worker fetches `https://bandcamp.com/<username>/feed` and receives a 200 response whose body does not contain `id="new-releases-vm"`
- **THEN** the worker throws `FeedShapeError` with the existing human-readable message
- **AND** no further `fan_dash_feed_updates` pages are fetched in that sync

#### Scenario: Feed page returns 5xx

- **WHEN** the worker fetches the feed page and receives a 5xx status
- **THEN** the worker throws an error whose message identifies the panel fetch and the status code
- **AND** the popup error UI renders the message without a raw stack trace

### Requirement: Panel parser is unit-tested against fixture HTML

A unit test SHALL exercise the followed-artists panel parser against at least four fixtures: a happy-path fixture with two `<li class="new-release" data-item-json="…">` items, an empty-panel fixture, a missing-container fixture, and a "hidden items" fixture in which one or more `<li class="new-release">` entries carry `style="display: none"` (or are otherwise CSS-hidden in a way that mirrors the real "show more" toggle). A fifth test SHALL exercise the merge-and-dedup composition against synthetic outputs of `parseFeedPage` and the panel parser sharing one `item_url`. The tests SHALL fail if a future code change removes the panel ingestion, the hidden-item coverage, or the dedup guard.

#### Scenario: Test runs against happy-path panel fixture

- **WHEN** the test invokes the panel parser with a fixture containing two `<li class="new-release" data-item-json="…">` items
- **THEN** it returns two normalised release objects whose `item_url` matches the fixture

#### Scenario: Test runs against missing-container fixture

- **WHEN** the test invokes the panel parser with HTML that lacks `id="new-releases-vm"`
- **THEN** it throws `FeedShapeError`
- **AND** does not throw `TypeError`

#### Scenario: Test runs against hidden-items fixture

- **WHEN** the test invokes the panel parser with a fixture containing three `<li class="new-release" data-item-json="…">` items, two of which carry `style="display: none"`
- **THEN** it returns all three normalised release objects, including the two that are CSS-hidden

#### Scenario: Merge dedup test sees overlapping item_url

- **WHEN** the test composes synthetic outputs of `parseFeedPage` and the panel parser that share one `item_url`
- **THEN** the combined release list contains that `item_url` exactly once

## MODIFIED Requirements

### Requirement: Feed-sync runs in the background worker

The background service worker MUST host the feed-sync flow end-to-end: the popup sends a `bandcamp:scrape-feed` message to the worker, and the worker fetches `https://bandcamp.com/api/fan/2/collection_summary`, `https://bandcamp.com/<username>/feed` (with `<username>` discovered from `collection_summary` or, failing that, from a `pagedata` blob fetched from `https://bandcamp.com/`), and `https://bandcamp.com/fan_dash_feed_updates` with `credentials: 'include'` from its own origin. The content script SHALL NOT be the producer of the feed-sync `releases` stream.

#### Scenario: Popup is on an artist subdomain

- **WHEN** the active tab points at `someartist.bandcamp.com` and the user clicks the Feed button
- **THEN** the worker performs the `collection_summary`, feed-page, and `fan_dash_feed_updates` fetches successfully
- **AND** the popup receives a single `releases` accumulation containing the deduplicated union of panel items and `nr` entries, plus the same `operationStatus` messages it would have received with the active tab on `bandcamp.com`

#### Scenario: Popup is on bandcamp.com

- **WHEN** the active tab points at `bandcamp.com` (homepage, discover, fan dashboard, the user's own feed) and the user clicks the Feed button
- **THEN** the worker performs all three fetches successfully and emits the same combined message stream as the subdomain case

### Requirement: Worker reuses the defensive feed parser

The worker handler MUST call `parseFeedPage`, `parseFollowedArtistsPanel`, and `assertJsonContentType` from `packages/browser-extension/src/js/content/bandcamp/feed-parse.js` rather than re-implementing parsers. Any future shape mismatch, non-JSON response, or missing panel container SHALL surface as a `FeedShapeError` exactly the way it does from the existing content-script path.

#### Scenario: Endpoint returns the legacy fan_dash_feed_updates shape

- **WHEN** the worker handler receives a `fan_dash_feed_updates` response with the expected `{ stories: { entries, oldest_story_date } }` shape
- **THEN** it forwards the filtered `nr` releases to the popup via the existing `releases` accumulation and advances `older_than` with the parser's `nextOlderThan` value

#### Scenario: fan_dash_feed_updates returns an HTML login redirect

- **WHEN** the worker handler receives a 200 `text/html` response to its credentialed `fan_dash_feed_updates` fetch
- **THEN** it throws `FeedShapeError` via `assertJsonContentType`, catches it, and reports the failure to the popup via the same `{ type: 'error', message, stack }` channel

#### Scenario: Feed page lacks the followed-artists panel container

- **WHEN** the worker handler receives an HTML body that does not contain `id="new-releases-vm"`
- **THEN** it throws `FeedShapeError` via `parseFollowedArtistsPanel` and reports the failure through the same error channel
- **AND** no `fan_dash_feed_updates` pages are fetched in that sync

### Requirement: No new manifest permissions

The worker-driven feed-sync flow MUST work using only the permissions the manifest already declares. Adding the followed-artists panel fetch SHALL NOT introduce any new `host_permissions` or `permissions` entries — `bandcamp.com` is already covered by the existing manifest.

#### Scenario: Manifest is unchanged

- **WHEN** the build emits the manifest after this change ships
- **THEN** its `host_permissions` and `permissions` arrays are byte-identical to the pre-change build
