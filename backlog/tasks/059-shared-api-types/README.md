---
id: 059
title: Define API types for the full feature surface
effort: M
created: 2026-05-07
---

# Define API types for the full feature surface

## Why

Without typed responses, every later mobile task re-derives the same
shapes by hand. Defining them once makes refactors safe.

## What

- Add types in `packages/shared/api-client/types.ts` for: tracks,
  previews, carts, follows, ignores, notifications, settings, score
  weights, stores, search results, public cart, sign-up status, push
  tokens.
- Match the actual JSON shape served by the backend
  (cross-reference each route handler — guess-typing is a trap).
- Re-export from the API client so callers get typed return values
  without importing `types.ts` directly.

## Acceptance criteria

- [ ] Every endpoint exposed by `packages/shared/api-client/` has a
      typed return value.
- [ ] At least one consumer screen uses the types and typechecks
      cleanly.
- [ ] Types are validated against fixtures captured from a live
      backend response (smoke check, not exhaustive).

## Code pointers

- `packages/back/routes/users/api.js` — most of the authenticated
  surface.
- `packages/back/routes/index.js` and `public.js` — public endpoints.
- `packages/back/routes/stores/` — store-search endpoints.
