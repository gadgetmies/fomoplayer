# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-07_ — Docs-only fix; do not relax the audience check on the
  consumer's `verifyHandoffToken` call. The strict origin binding is
  the security boundary that prevents cross-target token reuse.

## Rejected approaches

- _YYYY-MM-DD_ — what was tried, why it didn't work.

## Open threads

- Follow-up: consider a startup `logger.warn` when
  `isHandoffConsumerConfigured` is true but `API_URL` is unset on the
  backend service. Mirrors the existing
  "AUTH_API_URL set but OIDC_HANDOFF_SECRET missing" warning.

## Session log

- _2026-05-07_ — Item created from the security review of the PR
  preview handoff fix. Surfaced the hidden requirement that hit the
  initial deploy.
