---
id: 052
title: Bottom-tab navigator skeleton
effort: S
created: 2026-05-07
---

# Bottom-tab navigator skeleton

## Why

Every mobile story drops its screens into the same shell. Wiring the
bottom-tab navigator once unblocks all of them.

## What

- Use `@react-navigation/bottom-tabs` (or equivalent).
- Four tabs: **Tracks**, **Search**, **Carts**, **Settings**.
- Each tab is its own stack navigator so deep-screens push correctly
  inside a tab.
- Tab bar uses theme tokens (task 053).
- Active tab persists across app launches.

## Acceptance criteria

- [ ] Tapping each tab activates the matching stack and dismisses any
      transient sheets.
- [ ] Each tab's stack supports push/pop without collapsing back to the
      root on tab switch.
- [ ] Tab bar respects safe-area insets on notched devices.
- [ ] Selected tab persists across cold starts.

## Code pointers

- `packages/front/src/TopBar.js:175` — current web nav structure
  (Tracks → New / Recent / Heard, Carts dropdown, Settings link).
  Mobile collapses Tracks sub-pages into one tab; the sub-pages become
  a top segmented control inside the Tracks tab (task 065).

## Out of scope

- Real screen content for any tab — placeholders only.
- The mini-player above the tab bar (task 074).
