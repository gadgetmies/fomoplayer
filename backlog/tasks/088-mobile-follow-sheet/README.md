---
id: 088
title: Follow sheet from row long-press
effort: M
created: 2026-05-07
---

# Follow sheet from row long-press

## Why

The fastest path from "I like this track" to "follow this
artist / label" is from the track row itself. A bottom sheet
with one-tap follow per store is the right ergonomic.

## What

- Long-press → "Follow…" surfaces a bottom sheet with the track's
  artists and label as candidates, plus a free-text /
  paste-URL field.
- For each candidate, a follow toggle per available store.
- Reuses the same backend surfaces as the follow-search field
  in Settings → Following (the surface task 038 fixes — the
  underlying request layer must work in every environment first).
- After follow, an undo snackbar.

## Acceptance criteria

- [ ] One-tap follow on a candidate succeeds and the row's
      "followed" indicator (if visible) updates.
- [ ] Pasting a URL works for both artist and label URLs across
      supported stores.
- [ ] No regressions to task 038's fix — the same code path is
      exercised on mobile.

## Code pointers

- `packages/front/src/FollowPopup.js` — current web popup.
- `packages/back/routes/users/api.js:241` — follow artists.
- `packages/back/routes/users/api.js:258` — follow labels.
- Task 038 — same backend search-by-name-or-URL surface.
