---
id: 057
title: Extract API client + types into a shared package
effort: L
created: 2026-05-07
---

# Extract API client + types into a shared package

## Why

The mobile app and the web app should call the backend through the
same typed surface. Re-implementing fetch + retry + URL composition
on the mobile side would diverge instantly.

## What

- Create `packages/shared/api-client/` (or a new top-level
  `packages/api-client/` if shared layout suggests it) exporting
  typed functions for every endpoint the app uses.
- Mirror the existing semantics of
  `packages/front/src/request-json-with-credentials.js`: credentials
  forwarded, `?store=…` query parameter behaviour, JSON
  serialisation, error shape.
- Inject the base URL via a `createClient({ baseUrl })` factory so
  the web (`config.apiURL`) and the mobile (`EXPO_PUBLIC_API_URL`)
  can each provide their own.
- Decide inside this task whether the web migrates now or stays on
  the legacy module — write the rationale into `notes.md` either
  way.

## Acceptance criteria

- [ ] Shared package builds and is consumable by both `packages/mobile/`
      and `packages/front/`.
- [ ] All read endpoints used by the web app have a typed function in
      the new client.
- [ ] If the web migrates: the migration ships in this task with
      tests passing.
- [ ] Cross-package types stay in lockstep — adding a field to a
      response on the backend surfaces on both clients (or fails
      typecheck loudly).

## Code pointers

- `packages/front/src/request-json-with-credentials.js` — current
  request layer.
- `packages/back/routes/` — backend endpoints to model.
- `packages/shared/` — existing shared package layout.

## Out of scope

- TanStack Query setup on mobile (task 058).
- Generating types from an OpenAPI / schema source — manual types
  are fine for now; revisit if the surface grows.
