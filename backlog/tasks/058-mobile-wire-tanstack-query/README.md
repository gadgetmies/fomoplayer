---
id: 058
title: Wire TanStack Query in mobile with global error handling
effort: M
created: 2026-05-07
---

# Wire TanStack Query in mobile with global error handling

## Why

Every mobile screen needs caching, pagination, retry, and 401 handling.
Writing those once at the data-layer level saves rewriting them per
screen.

## What

- Add TanStack Query (`@tanstack/react-query`) to `packages/mobile`.
- Provide a `QueryClientProvider` at the app root with sensible
  defaults (stale time, retry count, retry-on-network-reconnect).
- Global error handler intercepts 401 responses and triggers the
  re-auth flow (story 041).
- Persistence-aware cache (`@tanstack/query-async-storage-persister`)
  so cached responses survive cold starts for offline tolerance.
- Devtools available in development builds.

## Acceptance criteria

- [ ] Provider wraps the navigator; `useQuery` works in any screen.
- [ ] A 401 from any endpoint surfaces the login screen and resets
      the query cache for authenticated keys.
- [ ] Cold start with a stale-but-recent cache shows cached lists
      while a background refetch runs.
- [ ] Offline → online transition triggers a refetch of mounted
      queries with `refetchOnReconnect`.

## Code pointers

- `packages/mobile/App.tsx` (or root) — provider mount point.
- Task 057 — typed API client this layer wraps.
