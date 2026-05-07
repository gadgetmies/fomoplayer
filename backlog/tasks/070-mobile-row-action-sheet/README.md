---
id: 070
title: Long-press action sheet
effort: S
created: 2026-05-07
---

# Long-press action sheet

## Why

Swipe gestures cover the two highest-frequency actions; the rest
(specific cart, mark purchased, ignore artist / label / release,
follow artist / label, share) live behind a long-press. This is
the "right-click menu" of mobile.

## What

- Long-press on a track row opens an action sheet (native iOS
  ActionSheet / Android BottomSheet) with:
  - Add to specific cart (sub-menu / picker)
  - Mark purchased / unpurchased
  - Follow artist / label
  - Ignore artist / label / release
  - Share track (native share sheet)
- Each action mutates via the shared API client and invalidates the
  relevant queries.
- Disabled state for actions that don't apply (e.g. no carts yet).

## Acceptance criteria

- [ ] Long-press on any row opens the sheet within ~250 ms.
- [ ] Each action's success / error feedback is consistent (toast
      for success on long actions; immediate UI update for fast
      ones).
- [ ] Sheet items respect dynamic-type sizing.
