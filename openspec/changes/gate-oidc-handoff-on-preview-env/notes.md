# Notes

Working notebook for this change. Date entries so future sessions can skim.

## Decisions

- _2026-05-08_ — Gate at the config layer (forcing handoff values to
  `undefined` when `!isPreviewEnv`) rather than gating individually
  inside `validateAuthConfig` and `auth.js`. One control point, no
  changes to downstream `Boolean(secret && origin)` checks. See
  design.md Decision 1.
- _2026-05-08_ — Also gate `allowedPreviewOriginRegexes` (forced to
  `[]` when `!isPreviewEnv`) for consistency. It's only consumed
  by the authority branch but the export feeds into
  `allowedOriginRegexes` (used by CORS), so making it deterministically
  empty in local dev removes any chance of a stray regex affecting
  CORS unintentionally.

## Rejected approaches

- _2026-05-08_ — Skipping `validateAuthConfig` entirely when
  `!isPreviewEnv` instead of forcing values to `undefined`. Rejected
  because it would leave the exported handoff values populated, so
  `auth.js`'s `isHandoffConsumerConfigured` could still see a
  non-empty `oidcHandoffUrl` and decide to delegate `/login/google`
  even though no secret is set. Forcing values keeps every observer
  consistent.
- _2026-05-08_ — Setting `PREVIEW_ENV=true` globally in
  `.env.test` to keep `api-key-exchange.js` working. Rejected
  because that flips `cookieSecure`, `sameSite`, and the Google sub
  allowlist gating for every test that loads the actual config. The
  scoped fix (extending `startServer` with an `env` override option,
  used only by the api-key-exchange test) is much smaller-blast-radius.

## Open threads

- None.

## Session log

- _2026-05-08_ — Implemented in this change. Two-line config gate
  in `packages/back/config.js`. Five tests in
  `config-preview-access.js` (2 existing + 3 new); mutation-checked
  the new tests by reverting the gate. Found one test-infrastructure
  surprise: `api-key-exchange.js` (which uses the legacy
  `/api-keys/exchange-handoff` endpoint via a spawned real backend)
  expected `canMintHandoff` to be true under .env.test, which under
  the new gate requires `PREVIEW_ENV=true` + `PREVIEW_ALLOWED_GOOGLE_SUBS`.
  Fixed by extending `startServer` to take an `env` option and
  having `api-key-exchange.js` opt in. This is consistent with the
  spec — handoff endpoints now require `PREVIEW_ENV=true` to
  activate, including in tests. Full auth suite: 167/167 pass.
