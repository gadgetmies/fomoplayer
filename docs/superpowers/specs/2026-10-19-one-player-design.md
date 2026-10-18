# One player — design

Change 2 of 3 for the notifications / sample-playback redesign (canvas "Sample
Match Playback", https://claude.ai/artifact/5srUyRFRmXn44kcCiZBUqA, page
"Navigation & placement", playback rules). Builds on `notification-backend`;
the Notifications page and aligned A/B playback of sample matches follow in
`notifications-page`.

## Goal

One audio owner for the whole app, following the canvas's playback rules:

1. **Nothing plays unseen** — wherever audio plays, play/pause is on screen.
2. **Navigating never stops playback.**
3. **Next follows the source** — next / previous step through the list the
   track was started from, not the list on screen; "Playing from …" links back
   to it.
4. **Starting from a new list switches the source.**

## Today

- `Player.getTracks()` picks next/previous from the list on screen
  (`listState`); on Settings `listState` is forced to `'new'`.
- On Settings the whole Player (and its `<audio>`) is `display: none` but keeps
  playing, so a track plays with no controls in sight.
- Audio samples on Settings › Notifications each have their own hidden
  `<audio>`, so a sample and a preview can play at the same time.

## Design

### Play queue (pure module `playQueue.js`)

- `listSource({ listState, selectedCart, searchTerms })` →
  `{ key, label, path }` for the list on screen:
  New / Recent / Heard (`Discover · New` …, `/tracks/<state>`), a cart
  (`Cart · <name>`, `/carts/<uuid>`), a search (`Search · <query>`,
  `/search/?q=<query>`).
- `samplesSource` → `{ key: 'samples', label: 'Audio samples', path: '/settings/notifications' }`.
- `queueTracks(playingFrom, onScreen)` — the source's tracks: the live on-screen
  list when its key equals the source key (so paging and heard state stay
  current), otherwise the snapshot taken when playback started.
- Unit-tested with Jest (`playQueue.test.js`).

### App state

- `playingFrom: { source, tracks }` beside `currentTrack`.
  `setCurrentTrack(track, playingFrom)` updates it when given; starting a track
  from a list passes that list's source and a snapshot of its tracks
  (rule 4). The source (not the snapshot) is persisted with the current track
  in localStorage; after a reload the queue falls back to the on-screen list
  when the keys match.
- `Player.jumpTracks` steps through `queueTracks(...)` instead of
  `getTracks()`. The New list's "load more near the end" stays, but only when
  New is both the source and on screen.

### Preview panel: "Playing from"

Under the title: `Playing from <link to source.path>source.label</link>`.

### Docked mini player on Settings

- The Player stays mounted and visible on Settings in a `docked` mode: the
  track list is hidden and the Preview panel collapses to a bar fixed to the
  bottom of the viewport — progress bar, play/pause, previous / next,
  artist – title, "Playing from" link, add-to-cart. The full panel's markup
  (with the one `<audio>` element) stays mounted but hidden, so playback
  continues untouched (rule 2).
- The bar shows only when there is a current track; Settings gets bottom
  padding while it is shown.

### Samples through the player

- `sampleAsTrack(sample)` maps an uploaded sample to a track-like item:
  `{ id: 'sample-<id>', kind: 'sample', title: <filename>, artists: [],
  labels: [], remixers: [], stores: [], previews: [{ id: 'sample-<id>',
  store: 'sample', format: 'mp3', url, waveforms: [] }] }`.
- Settings › Notifications rows get a play button that calls
  `onPlaySample(sample, samples)`; App plays it with
  `{ source: samplesSource, tracks: samples.map(sampleAsTrack) }`. The per-row
  `<audio>` elements are removed (one audio owner).
- Preview accepts `store: 'sample'` previews regardless of enabled stores, and
  `markHeard` / cart / follow / ignore actions skip `kind: 'sample'` items.

## Error handling

- A sample whose file cannot load surfaces through the existing audio `onError`
  logging; next / previous continue through the queue.
- An empty or stale snapshot (track no longer in it) falls back to the
  on-screen list.

## Testing

- Jest: `playQueue.test.js` (sources, live vs snapshot, stepping, skipping
  unplayable tracks).
- Demo tests (paired, shared steps in `test/lib/one-player-steps.js`):
  `one-player-local.js` / `one-player-preview.js` — play a track from Recent,
  open Settings: the docked player shows it with "Playing from Discover ·
  Recent" and keeps playing; next on the docked player advances within Recent;
  back on the track list, playing from a search switches the source. Both seed
  through `POST /api/me/tracks` (no DB), so the local test reuses the preview
  seeding unchanged.
- Existing browser tests (`playback.js`, `settings.js`) must stay green.

## Out of scope

Notifications page, bell, aligned A/B and loop-match (change 3).
