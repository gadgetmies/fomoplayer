# Story 040 — Shared API client & data layer

Extract the request layer used by the web app into a shared package, add
typed responses, and wire the mobile app's data layer (TanStack Query)
on top.

## User-facing change

Indirectly: the mobile app gets a single, typed, cached, retriable way
to talk to the backend, so screens load fast, mutations feel instant,
and 401s consistently kick the user back into the auth flow. The user
never sees this story — but every later screen is friendlier because it
exists.

## Why

The web app's `request-json-with-credentials.js` is small, but every
mobile screen would otherwise re-implement caching, pagination, retries,
and 401 handling. Extracting a shared client and standardising on
TanStack Query on the mobile side avoids that drift and lets the web
app benefit later if it migrates too.

## "Done" looks like

- A new `packages/shared/api-client` (or `packages/api-client`) module
  exports typed functions for tracks, carts, follows, ignores,
  notifications, settings, score weights, and auth/session.
- Mobile app uses it through TanStack Query for queries + mutations,
  with a global error handler for 401 → re-auth.
- The web app continues to work — either it migrates to the shared
  client in the same story or keeps its existing
  `request-json-with-credentials.js` until a later cleanup. Decide
  inside this story; don't bundle the web migration with the mobile
  build.

## Tasks

- [057 — Extract API client + types into a shared package](../../tasks/057-shared-extract-api-client)
- [058 — Wire TanStack Query in mobile with global error handling](../../tasks/058-mobile-wire-tanstack-query)
- [059 — Define API types for the full feature surface](../../tasks/059-shared-api-types)
