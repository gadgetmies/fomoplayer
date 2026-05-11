## 1. Backend lookup endpoint

- [x] 1.1 Add `getBandcampHeardStatus(userId, bandcampStoreUrl, bandcampIds)` in `packages/back/routes/users/db.js`. Read-only join over `store__track` (filtered by `store_url = bandcampStoreUrl`), `track`, `user__track` scoped to `userId`. Return a map `{ <bandcampId>: { trackId, heard } | null }` covering every input id.
- [x] 1.2 Export `getBandcampHeardStatus` from `packages/back/routes/users/logic.js` matching the existing `setTrackHeard` / `getUserTracks` pattern.
- [x] 1.3 Add `POST /api/me/tracks/heard-lookup` to `packages/back/routes/users/api.js`. Body shape: `{ store: 'bandcamp', ids: string[] }`. Validate that `store` is `'bandcamp'` and `ids` is a string array; respond `400` otherwise. Respond `401` (handled by existing auth middleware) for unauthenticated requests.
- [x] 1.4 Add backend tests under `packages/back/routes/users/` (cascade-test) covering: heard track present, unheard track present, track not in library, unknown Bandcamp id, read-only assertion (snapshot row counts and timestamps before/after).

## 2. Extension service worker plumbing

- [x] 2.1 In `packages/browser-extension/src/js/service_worker.js`, add a `bandcamp:heard-lookup` message handler that forwards `{ ids }` to `POST /api/me/tracks/heard-lookup` via `apiFetch` and returns `{ ok: true, lookup }` on success or `{ ok: false, error }` on failure.
- [x] 2.2 Short-circuit the handler to `{ ok: true, lookup: {} }` when there is no resolved access token, so content scripts get a clean "user not logged in" signal without surfacing an error.

## 3. Content-script indicator module

- [x] 3.1 Create `packages/browser-extension/src/js/content/bandcamp/heard-indicator.js` exporting `renderHeardIndicator()` (returns a shadow-DOM host with `aria-label="Heard in Fomo Player"`, `role="img"`, and shared spinner-style isolation) and `paintHeardIndicators(containersByBandcampId, lookupResult)`.
- [x] 3.2 In `packages/browser-extension/src/js/content/bandcamp/inject.js`, after `injectReleaseLevelButtons` populates new track rows: collect Bandcamp ids, dedupe against an in-memory `seenIdsThisPage` set, send one `bandcamp:heard-lookup` message, then call `paintHeardIndicators` with the result. Discography tiles and feed entries are out of scope (no DOM-exposed track ids; deferred to a follow-up change that adds URL-based lookup).
- [x] 3.3 Place the indicator inside the existing `buttonContainer()` so it sits before Play/Queue/Add-to-Fomo without disturbing layout.
- [x] 3.4 Add a guard so a re-injection pass with zero new ids issues no worker request (covers the MutationObserver re-fire scenario).

## 4. Codify heard-on-play behaviour

- [x] 4.1 Audited `audio-player.js`/`service_worker.js` — existing `bandcamp:report-heard` flow fires on the `play` event with no threshold. Extracted the play-handler into `heard-reporting.js` (`attachHeardReporting`) to make it unit-testable; behaviour is preserved (state-setting and broadcast stay on the original listener).
- [x] 4.2 Added `packages/browser-extension/test/heard-reporting.spec.js` covering: synchronous message dispatch on `play`, no minimum-duration threshold, null-track skip, error/rejection swallow, and teardown detachment.

## 5. End-to-end Recently Played coverage

- [x] 5.1 Add a backend test that calls `setTrackHeard(trackId, userId, true)` for a Bandcamp `store__track` and then `getUserTracks(userId, ['bandcamp'], …)` and asserts the track appears in the returned `heard` bucket with the expected timestamp ordering.
- [x] 5.2 Add a test that marks two Bandcamp tracks heard in order (A then B) and asserts B sorts before A in the returned `heard` bucket.
- [x] 5.3 Add a test that re-marks an already-heard track heard and asserts its timestamp updates and it moves to the top of the bucket.

## 6. Manual verification

- [ ] 6.1 Build the extension against a local Fomo Player instance, visit a Bandcamp release page with one heard track and one unheard track, and verify the indicator appears on the heard row only.
- [ ] 6.2 Press Play on an unheard Bandcamp track via the extension, refresh the Fomo Player Recently Played view, and verify the track appears at the top within a second.
- [ ] 6.3 Visit the Bandcamp feed and discography pages and verify (a) no indicators render (out of scope this iteration) and (b) no extra `fetchReleaseTralbum` requests are issued by the heard-indicator pass.
- [ ] 6.4 Sign out of Fomo Player in the extension and verify no indicators render and no lookup requests are sent on a Bandcamp page visit.

## 7. Wrap-up

- [ ] 7.1 Update the backlog task symlink: move `backlog/todo/d-007-bandcamp-heard-status-sync` to `backlog/to-be-verified/` once acceptance criteria are met.
- [x] 7.2 Capture decisions and any rejected approaches in `backlog/tasks/007-bandcamp-heard-status-sync/notes.md` so the trail survives the symlink move.
- [ ] 7.3 After user verification, archive the OpenSpec change with `/opsx:archive sync-bandcamp-listens-to-fomo-player`.
