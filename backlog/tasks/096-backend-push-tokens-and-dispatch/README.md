---
id: 096
title: Backend — push tokens + APNs/FCM dispatch
effort: L
created: 2026-05-07
---

# Backend — push tokens + APNs/FCM dispatch

## Why

The backend already aggregates "new tracks per saved search" for
email / web push. Native push reuses the same trigger but sends
through APNs / FCM (or Expo's push relay).

## What

- DB schema: per-user push-token table (token, platform,
  app version, last seen).
- API endpoints: `POST /api/users/push-tokens` (register),
  `DELETE /api/users/push-tokens/:id` (deregister).
- Dispatch: when a saved-search subscription matches new
  tracks, send a push to the user's registered tokens via
  Expo push (simplest) or direct APNs / FCM (lower-level,
  more control).
- Rate-limit per user / per device. Deduplicate against
  existing email / web push for the same trigger if needed.
- Cascade-tests for the registration / deregister endpoints
  and a smoke test for the dispatcher (mocked APNs / FCM).

## Acceptance criteria

- [ ] Registration / deregistration endpoints are typed,
      authenticated, and tested.
- [ ] Dispatch goes out within the existing notification
      cadence (don't worsen latency).
- [ ] Tokens are revoked on `Unregistered` / 410 responses
      from the push provider.
- [ ] Decision (Expo push vs. direct APNs/FCM) is documented
      in `notes.md`.

## Out of scope

- Mobile registration UI (task 097).
- Per-search subscribe UI (task 099).
