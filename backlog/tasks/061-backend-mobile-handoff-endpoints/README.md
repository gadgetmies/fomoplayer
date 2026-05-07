---
id: 061
title: Backend mobile handoff endpoints
effort: M
created: 2026-05-07
---

# Backend mobile handoff endpoints

## Why

Mobile needs its own consume endpoints, mirroring the extension and
CLI flows. Reusing those routes verbatim conflates surfaces and
makes per-client auditing harder.

## What

- Add `GET /api/auth/login/mobile` that initiates the OIDC flow
  with `state: { returnToMobile: true, deviceId, … }`.
- Add `POST /api/auth/mobile/token` that exchanges a one-time
  handoff token (issued via the same minted-handoff path used by
  PR previews and the extension) for a long-lived bearer/session.
- Add `POST /api/auth/mobile/logout` that revokes the bearer.
- Reuse `StatelessStateStore` (per the pr-preview-auth-handoff
  capability) — no new state plumbing.
- Cascade-tests covering: happy-path token issuance, replay
  rejection (one-time-use), expired-token rejection, signed-but-bad
  audience.

## Acceptance criteria

- [ ] Endpoints exist and are documented in
      `docs/auth/oidc-login-flow.md`.
- [ ] Tokens are signed (HMAC) with the existing handoff secret and
      reject after first use.
- [ ] Mobile bearer expiry / refresh strategy is documented (decide
      between long-lived bearer + refresh, or session cookie carried
      through `expo-secure-store` — write the rationale into
      `notes.md`).
- [ ] Backwards-compatible — the existing CLI / extension / PR
      preview flows continue to work unchanged.

## Code pointers

- `packages/back/routes/auth.js` — current login flows to mirror.
- `packages/back/routes/shared/oidc-state-store.js` — stateless
  state store this reuses.
- `packages/back/routes/shared/auth-handoff-token.js` — handoff
  token mint/verify helpers.
