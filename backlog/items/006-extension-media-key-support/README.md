---
id: 006
title: OS and keyboard media-key playback control
status: todo
priority: P3
effort: M
created: 2026-05-04
depends-on: []
---

# OS and keyboard media-key playback control

## Why

Users expect hardware media keys and OS-level Now Playing widgets to
control whatever is currently playing. Without this, they have to bring
the browser tab to focus to skip or pause, which interrupts other work.

## What

- Wire up the [Media Session API](https://developer.mozilla.org/docs/Web/API/Media_Session_API)
  for the extension's player so play / pause / next / previous map to
  extension playback.
- Verify behaviour on macOS, Windows, and Linux.

## Acceptance criteria

- [ ] Pressing a hardware media key (play/pause, next, previous) while
      the extension is playing controls extension playback.
- [ ] macOS Now Playing, Windows SMTC, and an MPRIS-aware Linux widget
      show the currently-playing track (title + artist + artwork if
      available).
- [ ] Behaviour does not regress when no audio is playing in the
      extension (the page or other tabs should still be able to claim
      the media session).

## Code pointers

- `packages/browser-extension/` — player audio element and metadata
  wiring.
- MDN Media Session API.

## Open questions

- Confirm that the Media Session API works when audio plays from a
  content-script-injected element. If it doesn't, route playback through
  a background service worker or extension page that owns the audio
  element.
