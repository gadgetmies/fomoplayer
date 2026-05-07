---
id: 074
title: Mini-player component
effort: M
created: 2026-05-07
---

# Mini-player component

## Why

A persistent mini-player lets users navigate the app while listening
without losing access to controls. Standard pattern in every music
app.

## What

- A bar above the bottom tab bar showing artwork, track title,
  artists, a play/pause button, and a thin progress bar.
- Tap → expand to full-screen Now Playing (task 075).
- Slide-up gesture on the bar also expands.
- Hidden when no track is loaded.
- Respects the safe-area inset so it sits above the home indicator.

## Acceptance criteria

- [ ] Mini-player is visible and functional on every tab while a
      track is loaded.
- [ ] Tap and slide-up both reach the Now Playing screen.
- [ ] Progress bar updates smoothly without dropping frames in the
      list above.
- [ ] Hidden cleanly when no track is loaded — list extends to the
      tab bar.
