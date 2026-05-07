---
id: 102
title: Onboarding tour (gestures + lock-screen + search-subscribe)
effort: M
created: 2026-05-07
---

# Onboarding tour (gestures + lock-screen + search-subscribe)

## Why

The web onboarding tour leans on keyboard shortcuts and a
help popup that don't translate to mobile. The mobile-specific
affordances — swipe gestures, lock-screen controls, push
notifications — need their own first-five-minutes story.

## What

- 3 to 5 lightweight screens shown to first-launch users:
  1. "Swipe right to add to your cart, swipe left to mark heard"
     (interactive demo on a sample track).
  2. "Tap a track to play; control playback from your lock
     screen" (with screenshot or live demo).
  3. "Save searches to get a push when new tracks match"
     (jumps into the push opt-in flow if accepted).
- Skippable; dismissable permanently from Settings.
- Localised to support multiple languages later (placeholder
  i18n hookup).

## Acceptance criteria

- [ ] Shown only to first-launch users.
- [ ] Skipping does not loop back on next launch.
- [ ] Each screen advances cleanly with a swipe / tap.
- [ ] Replayable from Settings → "Replay tour".

## Code pointers

- `packages/front/src/Onboarding.js` — current onboarding
  primitives.
- `packages/front/src/KeyboardShortcutsPopup.js` — desktop-only,
  not ported.
