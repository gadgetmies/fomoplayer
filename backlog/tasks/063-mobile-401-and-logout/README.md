---
id: 063
title: 401 interception + logout flow
effort: S
created: 2026-05-07
---

# 401 interception + logout flow

## Why

Sessions expire. The app must handle that gracefully — drop to login
with a clear message — and offer an explicit logout.

## What

- Global TanStack Query / API-client interceptor that, on a 401,
  clears in-memory caches, clears `expo-secure-store`, and routes to
  the login screen with a "Session expired — please sign in again"
  banner.
- An explicit Logout button in Settings → Account that calls
  `/api/auth/mobile/logout` (task 061), clears state, and routes to
  login.
- Pending mutations queued at the moment of 401 are preserved if
  feasible (replay after re-auth) — coordinate with the offline
  queue (task 103).

## Acceptance criteria

- [ ] A 401 from any endpoint immediately drops the user to the
      login screen with the banner.
- [ ] Logout button signs out cleanly — backend bearer revoked,
      local state wiped, no residual queries refetching.
- [ ] After re-auth, the user lands back on the screen they were on
      (best effort — fall back to Tracks if state is unrecoverable).
