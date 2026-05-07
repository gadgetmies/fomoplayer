---
id: 091
title: Sorting / score weights
effort: M
created: 2026-05-07
---

# Sorting / score weights

## Why

Score weights drive the New list ordering. The web exposes them
as inputs; mobile is more ergonomic with sliders / steppers.

## What

- Per-property sliders (or steppers) for each weight.
- Live preview: a small list of current top tracks re-sorts as
  weights change (debounced).
- "Reset to defaults" button.
- Saves to `/api/score-weights` on commit.

## Acceptance criteria

- [ ] Each weight is touch-adjustable with a clear current
      value.
- [ ] Preview reflects the change without a manual refresh.
- [ ] Save persists across cold starts.

## Code pointers

- `packages/back/routes/users/api.js:390` — get score weights.
- `packages/back/routes/users/api.js:394` — save score weights.
- `packages/front/src/scoreWeights.js` — current logic.
