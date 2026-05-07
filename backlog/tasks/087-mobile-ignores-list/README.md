---
id: 087
title: Ignores list (artists / labels / releases)
effort: S
created: 2026-05-07
---

# Ignores list (artists / labels / releases)

## Why

Mirror surface to the follows list — users need to inspect and
release ignores when they change their mind.

## What

- Tabs / segmented control: Artists · Labels · Releases.
- Swipe-left → un-ignore.
- Search-within-ignores.
- Empty state explains how ignores get added (long-press an
  artist on a track row, or via Settings).

## Acceptance criteria

- [ ] Lists each ignore-type accurately.
- [ ] Un-ignore round-trips through the corresponding DELETE
      endpoint.

## Code pointers

- `packages/back/routes/users/api.js:181` — labels.
- `packages/back/routes/users/api.js:196` — artists.
- `packages/back/routes/users/api.js:166` — artists-on-labels.
- `packages/back/routes/users/api.js:211` — releases.
