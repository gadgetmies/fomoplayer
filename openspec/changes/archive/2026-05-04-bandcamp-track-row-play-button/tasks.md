## 1. Inject the Play buttons

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/inject.js`, inside the `injectReleaseLevelButtons` per-row loop, append a `cueButton({ label: 'Play', onClick: ... })` BEFORE the existing `cueButton({ label: 'Queue', ... })`. The `onClick` MUST resolve the slim release via `releaseWithSingleTrack(release, trackId)`, return `{ ok: false, error: 'Could not resolve track' }` on null, and otherwise call `sendToWorker({ type: 'bandcamp:enqueue', releases: [slim], playNow: true })`.
- [x] 1.2 Confirm the `INJECTED_ATTR` marker on the wrapping `<span>` still gates re-entry so a re-running injection pass does not duplicate the Play button (the wrap is created once per row inside the same `if (row.querySelector(...)) return` guard — no new guard required).
- [x] 1.3 If a local uncommitted draft of step 1.1 already exists in the working tree, reconcile it against the spec rather than overwriting — the resulting code should match steps 1.1–1.2 exactly.
- [x] 1.4 In the same `injectReleaseLevelButtons` title-section block (the `#name-section` / `h2.trackTitle` group), append a `cueButton({ label: \`Play ${releaseLabel}\`, onClick: () => sendToWorker({ type: 'bandcamp:enqueue', releases: [release], playNow: true }) })` BEFORE the existing `cueButton({ label: \`Queue ${releaseLabel}\`, ... })`. The same `releaseLabel` ('release' / 'track') is reused so single-track pages render `Play track`.
- [x] 1.5 In `injectDiscographyButtons`, append a `cueButton({ label: 'Play', onClick: async () => { ... } })` BEFORE the existing `cueButton({ label: 'Queue', ... })`. The `onClick` MUST `await getReleases()`, return `{ ok: false, error: 'Could not load release' }` if the array is empty, and otherwise call `sendToWorker({ type: 'bandcamp:enqueue', releases, playNow: true })` — i.e. the same shape as the existing Queue button but with `playNow: true`.

## 2. Verify the runtime path

- [x] 2.1 Re-confirm by reading that `service_worker.js` forwards `bandcamp:enqueue` with `playNow` (currently at the `bandcamp:enqueue || bandcamp:set-queue` branch) and that `audio-player.js`'s `enqueue` implements append-and-play when `playNow: true` (concat to `state.queue`, set `state.index = insertAt`, call `playCurrent()`). No edits expected here — this is a read-only verification.

## 3. Build and exercise the extension

- [x] 3.1 Run the browser-extension build (per the package's existing build / dev script, with `FRONTEND_URL` set) and reload the unpacked extension in the browser.
- [x] 3.2 On a Bandcamp **album page with multiple tracks**, verify each track row shows exactly one Play, one Queue, and one Add-to-Fomo-Player control (no duplicates after scrolling / DOM mutations) AND the title section shows exactly one `Play release`, one `Queue release`, and one `Add release to Fomo Player`.
- [x] 3.3 With an empty Fomo Player queue, click per-row Play on a non-first track — confirm that track is appended, becomes active, and starts playing.
- [x] 3.4 With a non-empty queue (e.g. queue two tracks first), click per-row Play on a third track — confirm the prior two queue entries remain intact in their original order, the third is appended at the end, becomes active, and starts playing.
- [x] 3.5 Click any Play and confirm the click does NOT navigate the browser to the track's standalone page or release page.
- [x] 3.6 Double-click per-row Play rapidly — confirm the button shows the loading state and only one enqueue is issued (check the network / worker log).
- [x] 3.7 Visually confirm the Play button matches the Queue button's border / size / spacing on the same row, and that the title-section group reads as a single visual unit.
- [x] 3.8 On a Bandcamp **single-track page** (`/track/...`), confirm the title section shows `Play track` (not `Play release`) and clicking it appends-and-plays that one track.
- [x] 3.9 With a non-empty queue, click `Play release` on an album page — confirm prior queue contents are preserved in order, the album's tracks are appended in source order at the end, and playback starts from the first appended track of the album.
- [x] 3.10 On a Bandcamp **discography page**, verify each release tile shows exactly one Play, one Queue, and one Add-to-Fomo-Player control on the cover overlay, and clicking Play fetches the release, appends its tracks, starts playback of the first, and does NOT navigate to the release page.

## 4. Backlog and commit

- [x] 4.1 Update `backlog/items/001-bandcamp-track-row-play-button/notes.md` with a session log entry summarising the change and any deviations.
- [x] 4.2 Stage the inject.js change together with this OpenSpec change directory; do NOT commit yet — wait for explicit user verification per repo memory `feedback_verify_before_commit`.
- [x] 4.3 After user verification, commit (single commit covering inject.js + openspec change + backlog notes) and move backlog item 001 to Done in `backlog/INDEX.md`.
