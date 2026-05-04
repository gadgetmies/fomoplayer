---
id: 004
title: Align data-fp-injected controls after .time span
status: todo
priority: P2
effort: S
created: 2026-05-04
depends-on: []
---

# Align data-fp-injected controls after .time span

## Why

Injected controls currently sit in a position that conflicts with
Bandcamp's row layout, leaving them visually misaligned because of a left
margin that papered over the wrong DOM placement. Moving them after
`.time` aligns them naturally and lets the margin go.

## What

- Move the `[data-fp-injected]` elements so they appear **after** the
  `.time` span in the DOM, on each affected Bandcamp row.
- Remove the left margin previously applied to push them away from
  preceding elements.

## Acceptance criteria

- [ ] In a Bandcamp track row's DOM, `[data-fp-injected]` elements are
      siblings located immediately after `.time`.
- [ ] Buttons align with `.time` and surrounding controls without visible
      gaps or jitter.
- [ ] No horizontal shift or wrap on rows of varying width.

## Code pointers

- `packages/browser-extension/` — content script that creates and mounts
  the `[data-fp-injected]` controls on Bandcamp rows.
- The CSS rule applying the left margin (search for `data-fp-injected`).
