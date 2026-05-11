## Context

The Fomo Player browser extension already injects per-track controls
(Play, Queue, "Add to Fomo") on Bandcamp release pages, discography
listings, and feed entries — see
`packages/browser-extension/src/js/content/bandcamp/inject.js`. When the
user plays a Bandcamp track through the extension's embedded audio
host, `audio-player.js` sends a `bandcamp:report-heard` message on the
audio element's `play` event, which the service worker translates into
`POST /api/me/tracks/:fpTrackId` with `{ heard: true }`. The backend
sets `user__track.user__track_heard = NOW()`, and
`queryUserTracks`'s `recently_heard` CTE orders that bucket by
`user__track_heard DESC` — so a track that gets reported heard
automatically appears in the Recently Played list returned by
`GET /api/me/tracks`.

What is missing:

1. **Heard visualisation on Bandcamp pages.** No content-script code
   today reads heard status back from Fomo Player or paints any
   indicator on Bandcamp DOM.
2. **A non-ingesting lookup.** The only Bandcamp-id → FP-track-id
   bridge available is `POST /api/me/tracks` (ingest), which creates
   user-library rows as a side effect. That is correct for play /
   add-to-cart flows that imply intent, but wrong for "show me which
   of these tracks I have already heard" on page load.
3. **End-to-end coverage** of the heard reporting → Recently Played
   edge. Today nothing fails if `bandcamp:report-heard` silently stops
   firing — the two surfaces just drift.

Constraints (from `CLAUDE.md`):
- Bandcamp previews are full tracks. No time threshold on heard
  reporting; mark heard on `play` like `Preview.js` does.
- Configuration policy: no deployment hostnames in source. Existing
  extension code already routes through `apiFetch` against the
  user-configured `appUrl` — the new lookup endpoint must reuse that
  path.

## Goals / Non-Goals

**Goals:**
- Show a clearly recognisable heard indicator next to existing
  per-track controls on Bandcamp release pages, discography listings,
  and feed entries.
- Provide a backend endpoint that maps a batch of Bandcamp track ids
  to `{ fomoplayerTrackId, heard }` records, read-only, with no side
  effects.
- Codify the existing `onPlay` heard-reporting behaviour and the
  Recently Played edge as part of a versioned capability so future
  regressions surface.

**Non-Goals:**
- Marking tracks heard when the user plays them via Bandcamp's native
  player. The task scope is "via the extension" — Bandcamp's own
  player does not pass through extension audio events.
- New schema columns. The lookup is a read-only join over existing
  `store__track`, `track`, and `user__track` tables.
- Visualising heard status on Bandcamp surfaces where the extension
  does not already inject controls (e.g. discover, search results).
- Indicators on discography tiles and per-user feed entries. Those
  DOM surfaces expose only album / track URLs, not Bandcamp track
  ids, so resolving heard status would require one
  `fetchReleaseTralbum` per tile on page load — too expensive for a
  pure visualisation pass. Tracked separately as a follow-up: extend
  the lookup endpoint to accept Bandcamp URLs, then those surfaces
  can participate without per-tile fetches.
- Backfilling historic Bandcamp listens.

## Decisions

### Read-only lookup endpoint instead of extending ingest

Add `POST /api/me/tracks/heard-lookup` (or `GET` with a query — see
below) under the existing `/api/me/tracks` router in
`packages/back/routes/users/api.js`. It takes a list of Bandcamp track
ids scoped by the Bandcamp store id and returns
`{ <bandcampId>: { trackId, heard } }`. **POST is chosen over GET**
because Bandcamp release pages can have tens of tracks and feed pages
can have hundreds — URL length under GET is fragile across CDNs and
the extension already POSTs JSON for `apiFetch`.

Rationale:
- Reusing `POST /api/me/tracks` (current ingest path) would
  side-effect: ingestion adds the track to the user's library, which
  visualising must not do. A read on the visualisation path must not
  imply user intent.
- Single bulk endpoint avoids per-row request fan-out on pages with
  many tracks.

Alternative considered: extend the existing `POST /api/me/tracks` with
a `dryRun: true` flag. Rejected — overloads a write endpoint with
read semantics and adds a footgun (callers that forget the flag mass-
ingest).

### Indicator placement and styling

Render the heard indicator inside the same `buttonContainer()` that
already hosts Play / Queue / Add-to-Fomo, **before** the action
buttons on release-page track rows (so the eye scans status → action).

Implementation: a small custom-element-style host with a shadow root
(matching the existing `cueButton` pattern in `inject.js`) so Bandcamp
CSS cannot leak into it. The host carries `[data-fp-heard]` for
styling and accessibility (`aria-label="Heard in Fomo Player"`,
`role="img"`).

Rationale:
- Shadow DOM mirrors the existing per-button isolation strategy.
- Co-locating with action buttons keeps the visual grouping coherent
  and avoids touching unrelated Bandcamp markup.

### When to fetch heard status

Drive the lookup from the same MutationObserver-driven
`reinjectSoon()` loop in `inject.js` that already paints buttons.
After each injection pass, collect Bandcamp track ids from the rows
that received controls, debounce (single request per pass), and
dispatch one `bandcamp:heard-lookup` message to the worker. When the
result arrives, paint indicators on the matching rows.

Rationale:
- Reuses the existing observation + dedup (`data-fp-injected`)
  infrastructure.
- One request per injection pass keeps server load low and the UX
  pop-in inside one animation frame.

Trade-off: if Bandcamp dynamically loads more tracks (e.g. infinite
scroll on the feed), each new batch triggers a new lookup. Acceptable
— matches what already happens for button injection.

### Heard reporting stays in `audio-player.js`

The existing `bandcamp:report-heard` message-on-`play` flow is kept
as-is and codified by the new capability. No behaviour change in the
audio host. The spec captures:
- Fires on the `play` audio event.
- No time threshold.
- One report per track per playback session is sufficient (the
  backend write is idempotent — `setTrackHeard` just rewrites the
  timestamp).

Alternative considered: move heard reporting into the content script
on Bandcamp native player events. Rejected — out of scope and would
require hooking Bandcamp's player which is brittle.

### Recently Played is verified, not modified

`queryUserTracks` in `packages/back/routes/users/db.js` already
orders `recently_heard` by `user__track_heard DESC`. The spec asserts
this edge — that `GET /api/me/tracks` returns a track in the `heard`
bucket within seconds of `POST /api/me/tracks/:id { heard: true }`.
An end-to-end test in the back package exercises the full edge so a
future query change cannot silently desync it.

## Risks / Trade-offs

- **Risk:** Bandcamp's per-track ids in the page DOM do not always
  match the ids the extension uses for ingest (the row helper in
  `inject.js` already has multiple fallbacks: `rel="tracknum=N"`,
  `.track-number-col`, title match). → **Mitigation:** the lookup
  request reuses `extractTrackIdFromRow` so visualisation uses the
  exact same ids that the existing Play / Queue buttons use, ensuring
  parity with ingest.
- **Risk:** A user heard a track in Fomo Player via a different store
  (e.g. Beatport) but the same composition exists on Bandcamp under a
  different `store__track` id. The lookup will not surface that as
  heard. → **Trade-off:** intentional. "Heard" is recorded per-track
  in Fomo Player, and the same composition across stores is a
  different track row in the schema. Treating cross-store equivalence
  as heard is a separate problem (see backlog: track de-duplication
  initiatives).
- **Risk:** The lookup endpoint becomes a way to enumerate
  Bandcamp-ids tied to a user's library. → **Mitigation:** the
  endpoint requires the existing `/api/me` auth (logged-user
  scoping), and only returns records for tracks already in the
  user's library. Tracks that don't match return `null` (not
  enumerable as "exists but not yours").
- **Trade-off:** No optimistic UI on heard indicator after play. The
  user's listen will mark the track heard, but the visible indicator
  next to the row only appears on the next page load / mutation
  re-scan. → Accepted: scope is "visible on visit". Future
  iteration can listen for `audio:state` events and flip the
  indicator client-side.

## Migration Plan

No data migration. Roll out in one commit:

1. Land the lookup endpoint + tests behind the existing
   `/api/me/tracks` auth scope.
2. Land the extension content-script indicator + worker message
   handler.
3. Bump the extension manifest if needed and rebuild — no new host
   permissions required (existing `*.bandcamp.com` and configured
   `appUrl` permissions cover it).

Rollback: revert the commit. The backend route is purely additive;
removing it does not break older extension builds because they don't
call it.

## Open Questions

_(none — design is ready to implement.)_
