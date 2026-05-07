# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-07_ — Reuse the existing `auth_handoff_jti` table rather
  than introducing a new one. The column is opaque, both token types
  are short-lived single-use anti-replay tokens scoped to the auth
  flow, and the `INSERT ... ON CONFLICT DO NOTHING` semantics already
  fit.

## Rejected approaches

- _YYYY-MM-DD_ — what was tried, why it didn't work.

## Open threads

- Test strategy: in-process tests of `oidc-state-store.js` use a
  stubbed `consumeJti`. Real-DB races belong in an integration test
  if we already have a slot for that pattern.

## Session log

- _2026-05-07_ — Item created from the security review of the PR
  preview handoff fix. Theoretical replay window noted; not
  exploitable today but worth closing to simplify incident response.
