## Why

Heard status is a core Fomo Player concept but it is invisible while
browsing Bandcamp, so users re-listen to tracks they have already heard.
Conversely, listens started from Bandcamp via the extension already
report `heard` to the API (`bandcamp:report-heard` → `POST /api/me/tracks/:id`),
but this behaviour has no spec and is not exercised end-to-end against
the Recently Played surface — so a regression that breaks the
extension's heard reporting would silently desync the two surfaces.

## What Changes

- Add a non-ingesting bulk lookup so the extension can ask "of these
  Bandcamp track ids, which are already in Fomo Player and which are
  heard?" without creating user-library rows as a side effect. The
  existing `POST /api/me/tracks` ingest path is wrong for visualisation
  because it would mark unrelated tracks as added to the user's library.
- Inject heard indicators on the Bandcamp surfaces where the extension
  already injects controls:
  - Track rows on release pages (`.track_table tr.track_row_view`)
  - Discography listing tiles (`#music-grid > li`, `.music-grid-item`)
  - Feed entries (`.track_play_auxiliary` mounts)
- Codify the existing `bandcamp:report-heard` contract: the extension
  marks a Bandcamp track heard the moment its audio element fires
  `play`, with no time threshold — matching the frontend `Preview.js`
  behaviour. Bandcamp "previews" are full tracks, so any threshold
  would skip real listens (per project `CLAUDE.md`).
- Specify that any track marked heard via the extension MUST appear in
  the **Recently played** bucket returned by `GET /api/me/tracks`
  within seconds of playback starting, ordered by `user__track_heard`
  DESC.

## Capabilities

### New Capabilities

- `bandcamp-heard-status`: Lookup of Fomo Player heard status for
  Bandcamp tracks, visualisation of that status on Bandcamp pages, and
  the contract that listening to a Bandcamp track via the extension
  marks the track heard immediately and surfaces it in Recently Played.

### Modified Capabilities

_(none — `bandcamp-track-actions` covers per-track action buttons; the
heard indicator is a separate read-only surface and the new lookup
endpoint introduces a new behavioural contract that belongs in its own
capability.)_

## Impact

- **Backend** (`packages/back/routes/users/api.js`,
  `packages/back/routes/users/db.js`): one new route under `/api/me/`
  for bulk Bandcamp-id → `{ trackId, heard }` lookup. No schema
  changes — read-only join over `store__track`, `track`, and
  `user__track`.
- **Browser extension**
  (`packages/browser-extension/src/js/content/bandcamp/`): new module
  that injects a heard indicator next to existing per-track controls
  on release, discography, and feed surfaces, driven by a single
  worker-mediated bulk lookup per page. Service worker gets a new
  message type for the lookup.
- **Recently Played**: no frontend changes — the existing
  `recently_heard` CTE in `queryUserTracks` already orders by
  `user__track_heard DESC`. New end-to-end coverage will assert this
  edge actually fires when a Bandcamp listen reports heard.
- **Tests**: extension content-script tests under
  `packages/browser-extension/test/` for indicator injection and
  backend unit tests for the new lookup route. Cascade-test guidance
  applies (per user skill).
