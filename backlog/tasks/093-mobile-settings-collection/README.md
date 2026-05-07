---
id: 093
title: Collection (heard tracks bulk actions)
effort: M
created: 2026-05-07
---

# Collection (heard tracks bulk actions)

## Why

Power users periodically clear out heard tracks or mark a chunk
heard at once. The web has these as date-pickers; mobile uses
native pickers.

## What

- "Mark all heard since…" with a native date / interval picker.
- "Clear heard tracks since…" with a native confirmation alert.
- Total counts (total tracks, new tracks, heard tracks) shown
  at the top.

## Acceptance criteria

- [ ] Both bulk operations confirm before mutating; no
      destructive default action.
- [ ] After running, counts update without manual refresh.

## Code pointers

- `packages/back/routes/users/api.js:150` — patch heard.
- `packages/back/routes/users/api.js:155` — delete heard since.
