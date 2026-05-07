# Story 043 — Audio playback & Now Playing

Multi-store preview playback with prev/next, seek, and store-source
preference; persistent mini-player above the tab bar; full-screen Now
Playing on tap; native lock-screen / Control Center / Android
notification controls; Bandcamp full-track behaviour preserved.

## User-facing change

Tapping play on a track row starts playback, opens a mini-player above
the tab bar with progress and play/pause/skip controls, and registers
the track on the lock screen / Control Center (iOS) and notification
shade (Android) so the user can play / pause / skip / seek without
unlocking the phone or opening the app. Headset and car-Bluetooth
remote buttons work. Tapping the mini-player expands a full-screen Now
Playing with artwork, controls, and a store-source toggle.

## Why

Mobile audio without lock-screen integration is a step backwards from
the web. This is where "native app" actually pays for itself — and
where the current web experience can't go on a phone.

## "Done" looks like

- Plays a track's preview from any of the configured stores; auto-skips
  to the next track if no preview from the user's preferred stores is
  available (mirroring `Player.js` logic).
- Background audio works on iOS and Android (proper background modes,
  audio focus / interruptions handled).
- Lock-screen / Control Center metadata (title, artists, artwork) and
  remote commands (play, pause, prev, next, seek) work.
- Mini-player is visible above the tab bar whenever a track is loaded;
  hidden when none. Tapping expands Now Playing.
- Now Playing shows artwork, full track info, store-toggle, and the
  same long-press actions as a row.
- **Bandcamp full-track behaviour is honoured** (per `CLAUDE.md`): no
  preview-window skip logic on Bandcamp tracks; mark-heard fires the
  moment audio starts playing, not after a duration threshold.
- A track is marked heard when audio actually starts playing (not when
  the row is tapped, not when it's queued).

## Tasks

- [071 — Audio engine using `expo-av` or `react-native-track-player`](../../tasks/071-mobile-audio-engine)
- [072 — Queue model + prev/next + auto-skip on missing preview](../../tasks/072-mobile-queue-and-skip)
- [073 — Lock-screen / Control Center / notification controls](../../tasks/073-mobile-remote-controls)
- [074 — Mini-player component](../../tasks/074-mobile-mini-player)
- [075 — Full-screen Now Playing](../../tasks/075-mobile-now-playing-screen)
- [076 — Bandcamp full-track behaviour + mark-heard-on-play](../../tasks/076-mobile-bandcamp-full-track-and-mark-heard)
