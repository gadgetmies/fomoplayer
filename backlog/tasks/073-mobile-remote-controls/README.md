---
id: 073
title: Lock-screen / Control Center / notification controls
effort: L
created: 2026-05-07
---

# Lock-screen / Control Center / notification controls

## Why

Native remote controls are the single biggest reason to ship a
mobile app over the web. Without them the app is just a worse
mobile browser.

## What

- iOS: register `MPRemoteCommandCenter` handlers for play, pause,
  next, previous, seek; populate `MPNowPlayingInfoCenter` with
  title, artist, artwork, duration, current time.
- Android: media-style notification with the same actions; route
  remote commands through to the audio engine.
- Headset / Bluetooth / car-stereo media buttons (handled by the
  same remote commands).
- Artwork loaded async — placeholder until ready.

## Acceptance criteria

- [ ] Lock-screen on iOS shows track metadata + artwork and play /
      pause / prev / next / seek work.
- [ ] Control Center mirrors the lock screen.
- [ ] Android notification shade shows the same controls and
      survives app backgrounding.
- [ ] Headset play/pause and skip buttons work in the car and on
      Bluetooth headphones.
- [ ] Disconnecting Bluetooth pauses playback (matches platform
      conventions).

## Code pointers

- Task 071 chose the audio engine; that choice constrains how
  remote commands are wired (RNTP has built-in support; expo-av
  needs more glue).
