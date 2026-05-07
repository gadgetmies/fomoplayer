---
id: 069
title: Sort & filter bottom sheet
effort: S
created: 2026-05-07
---

# Sort & filter bottom sheet

## Why

The web app's sort/filter is a row of dropdowns at the top of the
track lists. On mobile, the same controls belong in a bottom sheet
opened from a button — keeps the list itself clean.

## What

- Bottom sheet (e.g. `@gorhom/bottom-sheet`) with controls for:
  sort field, sort direction, limit, "added since" date, "only new"
  toggle.
- Applying the sheet updates the active list query and re-fetches.
- Sheet state persists per-segment (New / Recent / Heard).
- Active-filter pill on the list header indicates non-default state.

## Acceptance criteria

- [ ] Sheet opens and dismisses smoothly; respects safe-area.
- [ ] Selected values match the web's URL query parameters
      semantically (sort, limit, addedSince, onlyNew).
- [ ] Reset-to-default button restores defaults in one tap.

## Code pointers

- `packages/front/src/App.js:85` — current default values for these
  filters.
- `packages/back/routes/index.js:40` — backend tracks endpoint.
