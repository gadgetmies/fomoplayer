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

