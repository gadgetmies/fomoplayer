## 1. Locate the click handler

- [x] 1.1 Find the "Add to Fomo Player" button injection code in `packages/browser-extension/` and identify the click handler attached on Bandcamp release pages.
- [x] 1.2 Confirm whether the button is rendered as a `<button>` or anchor — this determines whether `preventDefault()` is also needed.

## 2. Stop click propagation

- [x] 2.1 In the button's click handler, call `event.stopPropagation()` so Bandcamp's track-row click listener does not fire.
- [x] 2.2 If the button is an anchor (or any element with default navigation), also call `event.preventDefault()`.

## 3. Verify behaviour

- [ ] 3.1 Manually load a Bandcamp release page with multiple tracks (e.g. `https://offishproductions.bandcamp.com/album/plot-holes-vol-4`), click "Add to Fomo Player" on a track, and confirm the page does not navigate and the track is added.
- [ ] 3.2 Manually load a Bandcamp track page, click "Add to Fomo Player", and confirm it still works (no regression).
