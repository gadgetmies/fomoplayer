---
id: 099
title: Per-search subscribe / unsubscribe UI
effort: S
created: 2026-05-07
---

# Per-search subscribe / unsubscribe UI

## Why

Users need to manage subscriptions one-at-a-time, in context. The
list view (task 092) is the management surface; this task focuses
on the per-search controls reachable from the Search screen and
from the saved-searches list.

## What

- Subscribe toggle on each saved-search row.
- Bell icon in the Search screen header (task 080) shares this
  toggle's behaviour.
- On toggle, ensure push opt-in (task 097) is granted; if not,
  prompt.

## Acceptance criteria

- [ ] Toggle round-trips through the existing notifications API.
- [ ] Per-search toggle reflects state from any other surface
      that toggled it (Search header, saved-search row, web app).
- [ ] No duplicate prompts if permission was already granted.
