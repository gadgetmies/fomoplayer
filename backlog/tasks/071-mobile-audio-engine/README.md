---
id: 071
title: Audio engine using `expo-av` or `react-native-track-player`
effort: L
created: 2026-05-07
---

# Audio engine using `expo-av` or `react-native-track-player`

## Why

All later audio behaviour rides on the engine choice. Picking the
right one (and configuring background modes correctly) is a
load-bearing decision.

## What

- Evaluate `expo-av` (managed-friendly, simpler) vs.
  `react-native-track-player` (more capable around remote controls,
  queue, lock-screen integration). Document the decision in
  `notes.md`.
- Configure iOS background audio mode + interruption handling +
  audio session category (`Playback`, ducks others).
- Configure Android foreground service for background playback
  (audio focus, transient duck, become-noisy).
- Singleton service in the app exposes `play(track)`, `pause()`,
  `seek(seconds)`, `setVolume(v)`, plus events
  (`onTimeUpdate`, `onEnded`, `onError`).

## Acceptance criteria

- [ ] Audio plays in the background on iOS and Android with the
      app in the background or screen locked.
- [ ] Audio focus interruptions (incoming call, alarm) pause the
      stream and resume it correctly when the interruption ends.
- [ ] Headset disconnect ("becoming noisy") pauses playback on
      Android.
- [ ] Engine choice is documented and revisitable.

## Out of scope

- Lock-screen UI (task 073 — depends on this engine).
- Queue logic (task 072).
