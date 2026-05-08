---
id: 175
title: Incoming request rate limiting
created: 2026-05-08
---
## Current state

- `packages/back/index.js:77-85` wires `express-rate-limit` (10-min
  window, 100 requests) but **only when `process.env.USE_RATE_LIMITER`
  is set**. The default deploy has no global rate limiter.
- `packages/back/routes/shared/api-key-rate-limiter.js` enforces a
  per-API-key sliding window (`perMinute` / `perDay`) and is always
  active for `/api` calls authenticated with an API key. Enforcement
  is in-process — state is not shared across processes, so effective
  limits scale with instance count.

## Remaining scope

- Decide whether to enable the global limiter by default (drop the
  `USE_RATE_LIMITER` flag) or keep it opt-in and document why.
- For multi-instance deploys, replace the in-memory map in
  `api-key-rate-limiter.js` with a shared store (Redis or Postgres)
  so the per-key budget is enforced cluster-wide.
- Consider per-route / per-user buckets for cookie-authenticated
  traffic, not just API keys.