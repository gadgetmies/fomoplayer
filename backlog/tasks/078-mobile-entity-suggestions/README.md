---
id: 078
title: Entity suggestions panel
effort: M
created: 2026-05-07
---

# Entity suggestions panel

## Why

When users start typing, they want completions for known artists,
labels, and genres so they can commit a precise pill instead of
free-text.

## What

- As the user types, query the existing `/genres` and per-store
  search endpoints (`/stores/<storeName>/search/?q=…`) for matches.
- Suggestions appear in a panel below the input grouped by entity
  type, with the same store icons as track rows.
- Tap a suggestion → commit it as a typed pill (artist:NN /
  label:NN / genre:slug).
- Debounce + cancel-in-flight to avoid overlapping requests on
  fast typing.

## Acceptance criteria

- [ ] Suggestions surface within ~600 ms of last keystroke.
- [ ] Tapping a suggestion replaces any partial input with the
      committed pill.
- [ ] No memory leaks from cancelled requests.

## Code pointers

- `packages/back/routes/index.js:52` — `/genres` endpoint.
- `packages/back/routes/index.js:56` — `/followDetails` is the
  URL-search analog.
- `packages/back/routes/stores/` — per-store search.
