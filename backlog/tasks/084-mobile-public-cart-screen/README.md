---
id: 084
title: Public cart screen (no auth)
effort: M
created: 2026-05-07
---

# Public cart screen (no auth)

## Why

A friend tapping a shared cart link should be able to view it
without logging in — same as the web's public cart route. Auth
should be a path forward ("save this to my carts") rather than a
gate at the door.

## What

- Public cart screen renders without an authenticated session,
  using the existing `/api/public/carts/:uuid` endpoint.
- Read-only — no add / remove / mark-purchased.
- "Sign in to save this cart" CTA prompts auth (story 041) and
  on success offers to clone the cart.
- Reachable both from the deep-link (task 083) and from inside
  the app for shared carts.

## Acceptance criteria

- [ ] Cold-launching the app via a public-cart deep link loads
      the cart without prompting login.
- [ ] Authenticated users with the same UUID see the read-only
      view (no destructive actions).
- [ ] Sign-in CTA returns to the same cart afterwards.

## Code pointers

- `packages/back/routes/public.js:18` — public cart endpoint.
