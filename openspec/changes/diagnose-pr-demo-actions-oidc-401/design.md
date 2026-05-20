## Context

`PR Demo Test` mints a GitHub Actions OIDC token, deploys a Railway PR
preview, then runs `cascade-test` against that preview. Setup begins
with `packages/back/test/lib/setup.js` (~line 285–293) POSTing
`{ token }` to `/api/auth/login/actions`, which calls
`verifyActionsTokenFn({ token, audience: apiOrigin, allowedRepo:
githubActionsOidcRepo })` in `packages/back/routes/auth.js:784`. The
verifier (in `packages/back/routes/shared/github-actions-oidc.js`) uses
`jsonwebtoken.verify` with the GitHub Actions JWKS, the configured
issuer/audience/algorithm, and a hand-rolled post-verify check on the
`repository` claim. On any failure, it resolves `null`; the route then
returns 401 and `auth.js:790` logs a single opaque `logger.warn`.

This shape made sense as long as Actions OIDC worked locally and was
expected to work in preview. It does not: the cascade-test preview run
gets HTTP 401 today, and the conversation history (see
`.scratch/pr-demo-oidc-401-handoff.md`) records that every cheap
hypothesis — `RAILWAY_*` variables wrong, route not registered, ahem
trailing-slash audience, JWKS network failure, repo claim mismatch — has
been at most partially refuted. We cannot narrow further without
observability.

The previewbase and PR-preview environment vars have already been
confirmed (`API_URL` set, `PREVIEW_ENV=true`, `GITHUB_ACTIONS_OIDC_REPO`
set; the 401 — rather than 404 — proves the route is registered) so the
remaining unknown is strictly inside `verifyActionsToken`'s decision
branches.

## Goals / Non-Goals

**Goals:**

- Emit one structured log line per `/api/auth/login/actions` rejection
  that names *which* check failed and includes the unverified claims +
  expected values, so the next Railway log entry resolves the bug
  without another guess-and-deploy cycle.
- Apply the targeted root-cause fix indicated by the first post-deploy
  log, in the same change, so the diagnose → identify → fix arc lands
  together.
- Preserve test-double ergonomics: `verifyActionsTokenFn` injection in
  `actions-oidc-login.js` continues to work without callers being
  forced to pass a logger.

**Non-Goals:**

- Replacing `jsonwebtoken` or `jwks-rsa` with alternatives.
- Auditing or restructuring the broader auth router. The change is
  scoped to the Actions OIDC verifier and its one caller.
- Building generalised "explain why a JWT failed" infrastructure. The
  enumeration is closed and Actions-OIDC-specific.
- Adding metrics, traces, or other observability beyond structured
  `logger.warn`. The handoff goal is one diagnostic deploy.

## Decisions

### Decision 1: Use `jsonwebtoken.decode` to surface unverified claims

When `jwt.verify` rejects a token, the error object does not include
the claims that were checked. To know whether the audience or issuer or
repository mismatched, we have to decode the token *without* verifying
its signature. `jsonwebtoken.decode(token, { complete: true })` returns
`{ header, payload }` and never throws on bad signatures.

**Rationale:** The decoded claims are needed to make the log
actionable. We never grant trust on the basis of decoded claims — they
are logged for human eyes only, after `jwt.verify` has already
rejected the token.

**Alternative considered:** Re-implementing each check manually before
calling `jwt.verify` (decode → compare `aud`, then call `verify`).
Rejected because it duplicates `jsonwebtoken`'s own logic and risks
divergence (e.g. `aud` accepts string or string array, `iss` string
comparison, etc.).

### Decision 2: Closed `reason` enumeration over free-text messages

Each rejection emits one of four stable `reason` values:
`verifier-input-missing`, `jwks-key-fetch-failed`,
`signature-or-claim-verification-failed`, `repository-claim-mismatch`.
Free-form message detail goes alongside in structured fields
(`unverifiedClaims`, `jwtErrorName`, `jwtErrorMessage`, `observedRepo`,
etc.).

**Rationale:** The codebase already uses stable `reason` enums for
handoff failures (see `pr-preview-auth-handoff` spec, requirement
"Authority emits a stable `reason` string for each handoff failure").
Consistency with that pattern lets future log-search and alert rules
treat both flows the same way.

**Alternative considered:** A single `logger.warn` per failure with
all detail in one message string. Rejected because the four causes
have meaningfully different remediations and we want greppable
distinction.

### Decision 3: `logger` is optional, defaulted to a no-op

`verifyActionsToken` accepts `{ token, audience, allowedRepo, logger }`.
When `logger` is omitted (or its `.warn` is not a function), no log
is emitted and the function returns `null` exactly as before.

**Rationale:** The cascade-test `actions-oidc-login.js` injects a
stubbed `verifyActionsTokenFn` and never exercises the real verifier.
A required `logger` argument would either force every test fixture to
pass one or break inadvertently when call sites are added later.
Keeping it optional preserves the test double's small surface and
matches how `cascade-test` itself accepts an optional `logger`.

**Alternative considered:** Always require `logger`; throw if missing.
Rejected — strict at the cost of brittleness without payoff.

### Decision 4: Drop the opaque caller-side warn at `auth.js:790`

The current `logger.warn('Actions OIDC login rejected: invalid or
unauthorized token')` at the route level becomes redundant once the
verifier emits a structured warn on every rejection path. Keeping both
would double-log and the older line carries no information beyond
"something in the verifier returned null".

**Rationale:** Single source of truth for the failure reason. The
verifier is the only thing that knows *why* it rejected; the route
just sees `payload == null`.

**Trade-off:** If the verifier is ever called without a logger from
this route, we'd lose the warn entirely on a 401. Mitigated by
explicitly threading the route's logger through at the call site as
part of this change, and by spec'ing the logger-pass as a
requirement.

### Decision 5: Apply the root-cause fix in the same change

The handoff document anticipates that the diagnostic log will point at
exactly one cause (most likely audience normalization). Rather than
ship instrumentation alone and open a follow-up change, this change
includes a task to apply the fix once the log is read. If the log
points at a class of fix we already understand (audience trim, repo
claim sanity, JWKS connectivity), it lands here. If it points at
something larger (e.g. a `jsonwebtoken` bug), this change still ships
the instrumentation and the broader fix moves to a new change.

**Rationale:** Avoids the overhead of a separate spec round-trip for a
likely one-line fix. The diagnostic spec'd here stands on its own
value (future debugging) even if the fix never gets applied.

**Trade-off:** The change isn't fully predictable until the diagnostic
runs. Mitigated by the task list explicitly gating the fix on the log
output, and by keeping the proposal honest that the eventual fix is
TBD until observation.

## Risks / Trade-offs

- **Risk: log leaks PII via the decoded claims.** GitHub Actions OIDC
  tokens contain `sub`, `iss`, `aud`, `repository`, `repository_owner`,
  `ref`, `run_id`, etc. — no user PII, but they do identify the repo
  and workflow run. → Mitigation: this is the same data already in the
  GitHub Actions log for the same run, and the Railway log is
  operator-only. The log line whitelists fields explicitly rather than
  dumping the whole payload, so future additions to the OIDC claim set
  don't surprise us.
- **Risk: noisy log on legitimate retries.** A misconfigured external
  actor hammering `/api/auth/login/actions` would now emit one warn per
  rejection instead of the older opaque one. → Mitigation: warn-level,
  not error; cardinality is the same as before (one log per rejected
  request); the route is gated on `isPreviewEnv` so production never
  registers it.
- **Trade-off: more code on a verifier that was four lines.** The
  function grows by ~30 lines. → The complexity is in the logging,
  not the verification — the security-relevant `jwt.verify` call and
  its options are unchanged.

## Migration Plan

1. Land the instrumentation + spec on master.
2. Rebase `restyle-settings-sliders` (the open PR's branch) onto master
   so the Railway PR preview rebuilds with the new code.
3. Force-with-lease push the rebased branch.
4. Wait for Railway to redeploy the PR preview; retrigger `PR Demo Test`
   (`gh run rerun --failed <run-id>` or push an empty commit).
5. Read the Railway log entry for the new `verifyActionsToken` warn.
6. Apply the indicated fix in a follow-up commit on master, repeat the
   rebase, and re-verify.

**Rollback:** If the instrumentation itself causes a regression (e.g.
`jsonwebtoken.decode` throwing on malformed input), revert the one
commit on master; the cascade-test and route behaviour falls back to
the opaque-401 state we're in today.

## Open Questions

- **What does the first log say?** Cannot be answered until step 4 of
  the migration plan. Hypotheses ranked in the proposal: (1) audience
  string mismatch, (2) JWKS/network, (3) repo claim. The change ships
  regardless of which one fires; the corresponding fix is the dependent
  task.
- **Does the eventual fix require a workflow-side change?** If the
  audience needs trailing-slash normalization, that can be done either
  in the workflow (`audience=${PREVIEW_URL%/}`) or in the backend
  (`audience: apiOrigin.replace(/\/$/, '')`). Preferring backend
  normalization keeps the workflow simple and matches the rest of the
  config (frontend reads URLs through `fomoplayer_shared/config`).
  Decision deferred until the log confirms the cause.
