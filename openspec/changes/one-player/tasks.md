## 1. Play queue

- [x] 1.1 `playQueue.js`: list sources, samples source, `queueTracks`, `stepInQueue`; Jest tests
- [x] 1.2 App `playingFrom` state; `setCurrentTrack(track, playingFrom)`; persist source with current track
- [x] 1.3 Player passes the on-screen source + snapshot when a row is played; `jumpTracks` uses the queue

## 2. Playing from and docked player

- [x] 2.1 Preview shows "Playing from <label>" linking to the source path
- [x] 2.2 Player `docked` mode on Settings: hide track list, docked bar with controls/progress/link/cart; full panel stays mounted
- [x] 2.3 Settings bottom padding while the bar is visible; bar hidden without a current track

## 3. Samples through the player

- [x] 3.1 `sampleAsTrack`; Preview accepts `store: 'sample'` previews; track-only actions skip samples
- [x] 3.2 Settings sample rows play via `onPlaySample`; remove per-row audio elements

## 4. Verify and ship

- [x] 4.1 Demo tests `one-player-local.js` / `one-player-preview.js` with shared steps/seed
- [x] 4.2 Front-end unit tests, `yarn test:browser` relevant files, full back-end suite
- [ ] 4.3 Atomic commits, push, PR with demo blocks, preview deploy
