## ADDED Requirements

### Requirement: Bulk heard-status lookup endpoint

The backend SHALL expose a logged-user-scoped endpoint that takes a
batch of Bandcamp track ids and returns, for each id, whether the
corresponding Fomo Player track exists in the caller's library and
whether it is marked heard. The endpoint MUST be read-only — it MUST
NOT add tracks to the user's library, MUST NOT create or update
`user__track` rows, and MUST NOT emit any audit-style side effects.

#### Scenario: Track exists in the user's library and is heard

- **WHEN** an authenticated user POSTs a list containing a Bandcamp
  track id that resolves to a Fomo Player track already in the user's
  library with `user__track_heard` set
- **THEN** the response includes that Bandcamp id mapped to an object
  `{ trackId: <fp-track-id>, heard: <ISO-timestamp> }`

#### Scenario: Track exists but is not heard

- **WHEN** the Bandcamp id resolves to a Fomo Player track in the
  user's library with `user__track_heard IS NULL`
- **THEN** the response includes that id mapped to
  `{ trackId: <fp-track-id>, heard: null }`

#### Scenario: Track not in user library

- **WHEN** the Bandcamp id resolves to a Fomo Player track that is
  NOT in the user's library, OR the Bandcamp id does not resolve to
  any Fomo Player track
- **THEN** the response includes that Bandcamp id mapped to `null`
- **AND** no `user__track` row is created for the caller

#### Scenario: Endpoint is read-only

- **WHEN** the endpoint is called with any combination of Bandcamp ids
- **THEN** the row counts of `user__track`, `track`, and
  `store__track` are unchanged
- **AND** no rows in `user__track` have an updated `user__track_heard`
  timestamp as a result of the call

#### Scenario: Unauthenticated request is rejected

- **WHEN** the endpoint is called without a valid Fomo Player session
- **THEN** the response is `401 Unauthorized`
- **AND** no lookup is performed

### Requirement: Heard indicator on Bandcamp release-page track rows

The Fomo Player browser extension SHALL display a heard indicator on
each track row of a Bandcamp release page whose corresponding Fomo
Player track is heard in the logged-in user's library. The indicator
MUST be visually distinct from the existing action buttons (Play,
Queue, Add to Fomo) and MUST carry an accessible label identifying it
as Fomo Player heard status.

#### Scenario: Visiting a release with a previously heard track

- **WHEN** the user visits a Bandcamp release page where track A has
  been marked heard in Fomo Player and track B has not
- **THEN** track A's row shows the heard indicator
- **AND** track B's row does not show the heard indicator
- **AND** both rows still show the existing Play / Queue / Add-to-Fomo
  buttons

#### Scenario: Indicator is accessible

- **WHEN** the heard indicator is rendered on a track row
- **THEN** the indicator element carries
  `aria-label="Heard in Fomo Player"` and `role="img"` (or equivalent
  semantics) so assistive technologies announce the status

#### Scenario: Track not in the user's library

- **WHEN** a track row corresponds to a track that is not in the
  logged-in user's Fomo Player library
- **THEN** no heard indicator is rendered for that row

#### Scenario: User not logged in to Fomo Player

- **WHEN** the user is not logged in to Fomo Player (no valid access
  token resolved by the service worker)
- **THEN** no heard indicator is rendered on any track row and no
  lookup request is sent

### Requirement: Discography tiles and feed entries skip lookups without DOM-exposed track ids

The extension SHALL only request and render a heard indicator on
Bandcamp surfaces whose DOM directly exposes a Bandcamp **track id**
without requiring an additional network fetch per surface element.
Discography tiles and per-user feed entries only expose album / track
URLs in their DOM; rendering indicators on them would require one
extra HTTP fetch per tile to resolve a track id, which is prohibitive
on a page that can hold dozens of tiles. The extension MUST NOT
trigger those fetches on injection passes.

A follow-up capability MAY extend the lookup to accept Bandcamp
**URLs** alongside track ids so discography and feed surfaces can
participate without per-tile fetches; until that lookup exists, those
surfaces render no indicator.

#### Scenario: Discography tile has no DOM-exposed track id

- **WHEN** the user visits a Bandcamp discography page where each
  tile exposes only an album URL (no `data-trackid` or equivalent)
- **THEN** no heard indicator is rendered on any tile
- **AND** no additional `fetchReleaseTralbum` request is issued by
  the heard-indicator pass

#### Scenario: Feed entry has no DOM-exposed track id

- **WHEN** the user's Bandcamp feed renders entries whose
  `.track_play_auxiliary` ancestor exposes only an album / track URL
  (no `data-trackid` or equivalent)
- **THEN** no heard indicator is rendered on any feed entry
- **AND** no additional `fetchReleaseTralbum` request is issued by
  the heard-indicator pass

#### Scenario: Future surface exposes a track id directly

- **WHEN** a Bandcamp surface (now or in the future) renders a tile
  whose ancestor element carries a Bandcamp track id directly readable
  from the DOM (e.g. `data-trackid`)
- **THEN** the extension MAY include that id in the same per-pass
  lookup batch as release-page rows and render the indicator using
  the same component if the track is heard

### Requirement: Single lookup request per injection pass

The extension SHALL issue at most one Bandcamp-heard lookup request
per page injection pass driven by the existing MutationObserver loop.
Re-injection passes triggered by DOM mutations SHALL only issue a new
lookup if at least one new injected row has a Bandcamp track id not
covered by a prior lookup in the same page lifetime.

#### Scenario: Initial page paint

- **WHEN** the extension's `reinjectSoon()` loop runs for the first
  time on a release page and injects controls into N track rows
- **THEN** exactly one `bandcamp:heard-lookup` worker message is sent
  containing the N Bandcamp track ids
- **AND** exactly one `POST` to the lookup endpoint is issued

#### Scenario: MutationObserver re-fires with no new rows

- **WHEN** the MutationObserver fires re-injection but every track row
  is already marked with `data-fp-injected` and no new Bandcamp ids
  have been added to the page
- **THEN** no new lookup request is sent

#### Scenario: Infinite-scroll loads more rows

- **WHEN** Bandcamp loads additional rows into a discography or feed
  page after initial paint, and the new rows expose Bandcamp track
  ids not seen by prior lookups in the same page lifetime
- **THEN** the extension issues one additional lookup request for the
  new ids only

### Requirement: Extension marks Bandcamp track heard on play

The extension SHALL mark a Bandcamp track heard in Fomo Player the
moment the embedded audio host's audio element fires its `play` event
for that track. The extension MUST NOT apply any minimum-playback-
duration threshold before reporting heard, matching the frontend
`Preview.js` `onPlay` contract (Bandcamp "previews" are full tracks,
so any threshold would skip real listens).

#### Scenario: Audio play event marks track heard immediately

- **WHEN** the embedded audio host starts playback of a Bandcamp track
  whose `fomoplayerTrackId` is known and the underlying `<audio>`
  element fires `play`
- **THEN** the extension issues `POST /api/me/tracks/:fomoplayerTrackId`
  with body `{ heard: true }` within one event-loop tick
- **AND** no time-threshold logic gates the call

#### Scenario: Playback paused before threshold does not block heard

- **WHEN** the user starts a Bandcamp track via the extension and
  pauses it before any arbitrary duration (e.g. 1 second) has elapsed
- **THEN** the track is still marked heard, because the `play` event
  already fired before the pause

#### Scenario: Track without a Fomo Player mapping is skipped silently

- **WHEN** playback starts for a queue item whose
  `fomoplayerTrackId` is `null` (ingest did not return a mapping)
- **THEN** no heard report is sent
- **AND** no error is surfaced to the user

### Requirement: Bandcamp listens surface in Recently Played

The `GET /api/me/tracks` response SHALL include any Bandcamp track
that has been marked heard by the extension in its `heard` (Recently
Played) bucket within seconds of the heard report, ordered most-
recent first by `user__track_heard`. The next time the Recently
Played view re-fetches `/api/me/tracks`, the track MUST be present
with no additional client-side state changes required.

#### Scenario: Bandcamp play, then refresh Recently Played

- **WHEN** the user plays Bandcamp track A through the extension at
  time T, and then `GET /api/me/tracks` is called at time T+Δ where Δ
  is less than one second
- **THEN** track A appears in the `heard` bucket of the response with
  a `heard` timestamp ≈ T

#### Scenario: Heard timestamp orders the bucket

- **WHEN** the user plays Bandcamp tracks A, then B, then C through
  the extension, in that order, and then `GET /api/me/tracks` is
  called
- **THEN** the `heard` bucket lists C before B before A, ordered by
  `user__track_heard DESC`

#### Scenario: Re-listening updates the timestamp

- **WHEN** the user has previously heard Bandcamp track A and plays
  it again through the extension
- **THEN** A's `user__track_heard` timestamp updates to the latest
  play time
- **AND** A moves to the top of the `heard` bucket on the next
  `GET /api/me/tracks`
