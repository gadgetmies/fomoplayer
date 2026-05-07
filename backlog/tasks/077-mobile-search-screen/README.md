---
id: 077
title: Search screen with pill input
effort: M
created: 2026-05-07
---

# Search screen with pill input

## Why

Pills (artist, label, genre, generic text) are the existing
ergonomic for a multi-faceted search. They translate naturally to
mobile if the input is large and the chips are tappable.

## What

- Search tab dedicated screen with a top input that converts
  committed terms to pills and supports tap-to-edit / tap-to-remove.
- Reuse parsing / serialisation logic from
  `packages/front/src/searchTerms.js` (port to TS in the shared
  package).
- 500 ms debounce, then a `GET /api/tracks/?q=…` query rendered
  with the row component.
- Filter state (sort, limit, addedSince) reuses the sort/filter
  sheet (task 069).

## Acceptance criteria

- [ ] Typing committable text and pressing space / comma commits a
      pill.
- [ ] Tap-removing a pill triggers a refetch.
- [ ] Empty query shows recent / saved searches (task 079).
- [ ] Search URL is shareable / deep-linkable
      (`fomoplayer://search?q=…&names=…`).

## Code pointers

- `packages/front/src/searchTerms.js` — parsing helpers.
- `packages/front/src/SearchBar.js` and `SearchBarBase.js` —
  current pill input.
