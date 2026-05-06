---
id: 032
title: Restore the refresh button on desktop
effort: S
created: 2026-05-06
---

# Restore the refresh button on desktop

## Why

The refresh button was removed in favour of pull-to-refresh
(`78fda47d feat: replace refresh button with pull-to-refresh`).
Pull-to-refresh only works with touch input, so on desktop there is
now no in-app way to refresh the track list — the user has to reload
the whole page (losing scroll position, transient state, and queue
focus). That's a UX regression for the primary action on the primary
view.

## What

- Bring back a refresh button on desktop / non-touch devices.
- Keep pull-to-refresh on touch devices; the two should not both be
  visible at once on the same device.
- Drive the same refresh action that pull-to-refresh already calls
  (`refreshTracks` → `onUpdateTracksClicked`) so behaviour stays
  consistent.

## Acceptance criteria

- [ ] On desktop (no touch / mouse-driven), a visible refresh control
      is present on the views where pull-to-refresh applies (`new`,
      `recent`, `heard`) and triggers the same refresh as
      pull-to-refresh.
- [ ] On touch devices, pull-to-refresh continues to work and the
      desktop button is not shown (or is shown in a way that doesn't
      duplicate the gesture).
- [ ] The button reflects the in-flight state — disabled / shows a
      spinner while `state.updatingTracks` is true — and re-enables
      after the refresh completes or fails.
- [ ] Verified manually in a desktop browser without emulating touch.

## Code pointers

- `packages/front/src/Tracks.js:427` — `isPullToRefreshAvailable()`
  gates the gesture and the existing pull-down indicator. The desktop
  button gating should mirror the same `listState` check but invert
  the touch condition.
- `packages/front/src/Tracks.js:626` — `refreshTracks()` already
  wraps the refresh action and manages `updatingTracks` state. Wire
  the new button straight to it.
- `packages/front/src/Tracks.js:913` — pull-to-refresh indicator
  render. The desktop button likely belongs adjacent to / in the same
  header area; check the surrounding render for the right slot.
- Removal commit: `git show 78fda47d` — see what the previous
  desktop button looked like and where it was placed; the simplest
  fix may be to bring back roughly that markup behind a non-touch
  guard.

## Out of scope

- Changing the underlying refresh behaviour or the
  `onUpdateTracksClicked` contract.
- Reworking the pull-to-refresh visual or threshold.
- A keyboard shortcut for refresh — track separately if wanted.

## Open questions

- How to detect "non-touch" reliably enough? A media query like
  `(hover: hover) and (pointer: fine)` is usually a better signal
  than UA sniffing; check whether the codebase already has a
  helper before introducing one. As a fallback, just always show
  the button — duplicating with the gesture on touch devices is
  ugly but not broken.
