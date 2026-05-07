---
id: 098
title: Notification deep-link handler
effort: S
created: 2026-05-07
---

# Notification deep-link handler

## Why

A push that opens the app to a generic state is wasted — users
need to land on the search / tracks the notification was about.

## What

- Push payload includes a `route` (e.g. `search?q=…&names=…`,
  `tracks/new`, `carts/<uuid>`).
- App's notification handler routes to the matching screen on
  tap, even from a cold start.
- Fallback: route to Tracks tab if route is unknown.

## Acceptance criteria

- [ ] Tapping a push from a cold start opens the app at the
      target route.
- [ ] Tapping while the app is foregrounded routes without
      relaunching.
- [ ] Unknown routes fall back gracefully.
