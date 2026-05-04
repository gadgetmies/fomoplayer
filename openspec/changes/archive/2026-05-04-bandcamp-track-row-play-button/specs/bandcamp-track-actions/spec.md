## ADDED Requirements

### Requirement: Per-row Play button appends and starts playback

Each Bandcamp track row that already receives Fomo Player per-row controls SHALL also expose a "Play" button adjacent to the existing per-row "Queue" button, and activating it SHALL append the row's track to the end of the Fomo Player queue and immediately start playback of that newly appended track. The action MUST NOT replace, reorder, or remove any existing queue contents, and MUST NOT trigger Bandcamp's own track-row navigation.

#### Scenario: Play from a release with an empty queue

- **WHEN** the Fomo Player queue is empty and the user clicks "Play" on a track row of a Bandcamp release page
- **THEN** that track is appended to the queue, becomes the active track, and playback starts.

#### Scenario: Play from a release with an existing queue preserves prior tracks

- **WHEN** the Fomo Player queue already contains one or more tracks and the user clicks "Play" on a track row of a Bandcamp release page
- **THEN** the clicked track is appended at the end of the queue (the prior tracks remain in their original order and are not removed), the appended track becomes the active track, and playback starts from it.

#### Scenario: Play does not navigate the page

- **WHEN** the user clicks "Play" on a track row of a Bandcamp release page or single-track page
- **THEN** the browser remains on the current page; Bandcamp's own track-row click handler does not navigate to the track's standalone page.

### Requirement: Per-row Play button shares the Queue button's visual and feedback treatment

The injected "Play" button SHALL use the same visual style and loading / error feedback lifecycle as the existing per-row "Queue" button so the two read as a single button group, and the button MUST ignore further clicks while its own request is in flight.

#### Scenario: Loading indicator on click

- **WHEN** the user clicks "Play" on a track row
- **THEN** the Play button immediately enters its loading state (label hidden, spinner visible, disabled) and remains there until the service worker responds or the request times out.

#### Scenario: Error indication on a failed play

- **WHEN** the service worker responds that the enqueue-and-play failed, or the request times out
- **THEN** the Play button briefly shows its error indication (error-tinted border, error tooltip) and then returns to its idle state so the user can retry.

#### Scenario: Re-entry guard during in-flight click

- **WHEN** the user clicks the same Play button twice in rapid succession before the first request settles
- **THEN** only one `bandcamp:enqueue` request with `playNow: true` is issued for that row.

### Requirement: Per-row injection remains idempotent with the new button

Per-row injection SHALL remain idempotent under MutationObserver-driven re-injection, and each track row MUST contain exactly one Play button, one Queue button, and one "Add to Fomo Player" cart control.

#### Scenario: Mutation-driven re-injection does not duplicate buttons

- **WHEN** the page's track table mutates (e.g. Bandcamp re-renders the row, or another script appends nodes) and the extension's injection pass runs again
- **THEN** each track row continues to expose exactly one Play, one Queue, and one Add-to-Fomo-Player control — no duplicate buttons are added.

### Requirement: Release-level Play button appends the release and starts playback

The release-level Fomo Player button group SHALL include a "Play" control alongside the existing release-level "Queue" and "Add to Fomo Player" controls — both in the title-section group on Bandcamp release / track pages and in the per-tile group on the discography grid — and activating it SHALL append every track of that release to the end of the Fomo Player queue in source order and immediately start playback of the first appended track. The action MUST NOT replace, reorder, or remove any existing queue contents, MUST NOT navigate the page, and the button MUST share the same visual style and loading / error feedback lifecycle as the release-level "Queue" button it sits next to.

#### Scenario: Title-section Play on a multi-track album

- **WHEN** the user clicks the title-section "Play release" control on a Bandcamp album page that has multiple tracks
- **THEN** every track of the album is appended to the queue in source order, the first appended track becomes active, and playback starts.

#### Scenario: Title-section Play on a single-track page

- **WHEN** the user clicks the title-section "Play track" control on a Bandcamp `/track/...` page
- **THEN** the single track is appended to the queue, becomes active, and playback starts.

#### Scenario: Release Play preserves prior queue contents

- **WHEN** the Fomo Player queue already contains tracks and the user clicks any release-level "Play" control
- **THEN** the prior queue contents remain in their original order and position, the release's tracks are appended after them, and playback starts from the first appended track.

#### Scenario: Discography-grid Play on a release tile

- **WHEN** the user clicks the "Play" control on a release tile in a Bandcamp discography grid
- **THEN** the extension fetches the release, appends all of its tracks to the queue, starts playback of the first appended track, and the browser does not navigate to the release page.

#### Scenario: Release-level injection stays idempotent with the new button

- **WHEN** the page mutates and the injection pass runs again on a release page or discography grid that already has the Fomo Player buttons
- **THEN** the title-section and each discography tile continue to expose exactly one Play, one Queue, and one Add-to-Fomo-Player control — no duplicate buttons are added.
