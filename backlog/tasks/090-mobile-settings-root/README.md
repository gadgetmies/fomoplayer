---
id: 090
title: Settings root list & navigation
effort: S
created: 2026-05-07
---

# Settings root list & navigation

## Why

The web app's Settings is one big tabbed page. On mobile the
right shape is a list-detail navigation pattern, with each
section as its own focused screen.

## What

- Settings tab root shows a grouped list with sections
  matching the web pages: Account, Following, Sorting,
  Carts, Notifications, Ignores, Collection, Integrations.
- Each row navigates into a sub-screen (delivered by tasks
  091–095 + tasks 086 / 087 for following / ignores).
- Search-by-name-or-URL field for follows lives inside the
  follow-management surface (story 046), not the Settings root.
- App version + help / feedback links at the bottom.

## Acceptance criteria

- [ ] Each row navigates correctly; back gesture returns to the
      root.
- [ ] Disclosure indicators and grouping match platform style.
- [ ] No content from individual sub-pages leaks into the root.

## Code pointers

- `packages/front/src/Settings.js:592` — current tab structure
  to mirror semantically.
