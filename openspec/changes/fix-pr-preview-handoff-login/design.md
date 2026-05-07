## Context

Fomo Player runs PR previews on Railway under hostnames like
`fomoplayer-<service>-<project>-pr-NNN.up.railway.app`. Each PR preview is its
own Express backend, but Google OIDC is configured to call back to a single
"previewbase" host (set via `GOOGLE_OIDC_API_REDIRECT`). The previewbase acts
as the OIDC *authority*: it runs the OIDC round trip, then mints a short-lived
handoff token signed with `INTERNAL_AUTH_HANDOFF_SECRET` and redirects the
browser to the consumer's `/login/google/handoff` endpoint, where the consumer
verifies the token, looks up/creates the account, and calls `req.login` to
establish the local session.

Today this round trip does not complete from a PR preview. Two failure modes:

1. **Already-logged-in previewbase.** The user lands authenticated on the
   previewbase, never returns to the PR preview. The previewbase's
   `/login/google/return` calls `req.login` for the *previewbase* session
   instead of the handoff branch.
2. **Cold previewbase.** The OIDC round trip completes but the user lands at
   `<previewbase>/?loginFailed=true`. The most likely candidates are
   - `info.state` arrives without `handoffTarget` (passport's session-backed
     state was lost across the Google round trip on the previewbase host), or
   - The handoff target hostname allowlist is misconfigured on the
     previewbase service so `isSafeHandoffTarget` rejects every PR preview
     hostname before mint.

The auth code that gates these branches is in
`packages/back/routes/auth.js` lines 131–155 (delegation + state composition),
521–624 (return handler), and 25–40 of
`packages/back/routes/shared/safe-redirect.js` (target allowlist). Today the
existing logging emits one `logger.warn` ("Handoff requested but cannot be
fulfilled") that does not differentiate between the failure cases, so an
operator looking at Railway logs cannot tell which guard tripped.

The relevant configuration is documented in `PREVIEW_DEPLOYMENT.md`. There is
no existing OpenSpec spec for the auth-handoff capability — this change
introduces one.

## Goals / Non-Goals

**Goals:**

- The cross-origin PR-preview ↔ previewbase OIDC handoff round trip completes
  in both cold-start and existing-previewbase-session scenarios.
- The `handoffTarget` carried in the OIDC `state` survives the Google round
  trip even when the previewbase's session-backed state is dropped.
- An existing previewbase session never short-circuits a handoff: when
  `handoffTarget` is set on the return, the previewbase mints a token and
  redirects to the consumer instead of calling `req.login` on itself.
- Each rejection branch on the previewbase emits a distinct, structured log
  line that names the tripped guard (`state-missing-handoff-target`,
  `handoff-target-unsafe` with `subReason: allowlist-not-configured` or
  `origin-not-allowed`, `handoff-mint-failed`, `oidc-identity-missing`).
- A cascade-test covers the handoff happy path (cold-start) and a regression
  test covers the existing-previewbase-session case using an in-process
  Express app, mirroring `handoff-login-signup-policy.js`.
- `PREVIEW_DEPLOYMENT.md` documents that the previewbase needs
  `HANDOFF_TARGET_ORIGIN_REGEX` set to a regex matching its allowed
  consumer origins, and explains why.

**Non-Goals:**

- Reworking the handoff token format, switching algorithms, or rotating
  `INTERNAL_AUTH_HANDOFF_SECRET`.
- Changes to the CLI or browser-extension login flows that share the same
  router (`/login/cli`, `/login/extension`, `/login/google/return` branches
  for `returnToCli` / `returnToExtension`). Those branches must remain
  unchanged.
- Replacing passport's session-backed `state` with a different OIDC library.
- Adding a UI for handoff diagnostics beyond log lines.

## Decisions

### Decision 1 — Drop `req.login` on the previewbase when `handoffTarget` is set

**Choice:** When `info.state.handoffTarget` is present on the OIDC return, the
previewbase MUST take the handoff branch and MUST NOT establish a previewbase
session for the user. This is true even if the previewbase already has a
session for the same user before the round trip starts.

**Why:** Failure mode 1 happens because an existing previewbase session
combined with a passport state that lost `handoffTarget` lets the code fall
through to the trailing `req.login` block. Treating `handoffTarget`
presence at request *start* as authoritative — and persisting it through the
return — eliminates the ambiguity. The user starting the flow on a PR preview
should never end up with a previewbase session as a side effect.

**Alternative considered:** Keep `req.login` on the previewbase and add a
secondary redirect after login. Rejected because (a) it leaks a session the
user did not ask for and (b) it depends on the same fragile session state to
trigger the secondary redirect.

### Decision 2 — Carry `handoffTarget` in a signed state token, not just session

**Choice:** Sign `{ returnPath, handoffTarget }` with the existing handoff
secret (HS256, 5-minute TTL, dedicated audience like `oidc-state`) and use it
as the OIDC `state` value when delegating from the consumer or originating on
the previewbase. On return, prefer the signed token; fall back to passport's
`info.state` only if the signed payload is absent or invalid (logged
explicitly).

**Why:** Passport's session-backed state stores `{ returnPath, handoffTarget }`
under a session key and only sends an opaque lookup id to Google. Railway's
edge plus the way the session cookie is scoped on `up.railway.app` makes
losing the session entry across the round trip plausible (and matches the
observed symptom of `info.state` arriving empty). A signed self-contained
state value removes session persistence as a single point of failure without
giving up CSRF protection — the signature plus `aud`/`exp` claims serve the
same purpose.

**Alternative considered:** Switch to a stateless OIDC `state` derived from a
random nonce stored in the cookie session only. Rejected because it does not
fix the underlying "session entry missing" symptom; it just renames the
storage. Reusing the existing handoff signing infrastructure adds zero new
dependencies.

**Edge:** Don't break CLI / extension flows. `state` for those branches keeps
its current shape (`returnToCli` / `returnToExtension`) and stays
session-backed. The signed-state fallback applies only when `handoffTarget`
is in scope.

### Decision 3 — Emit one structured `logger.warn` per failure branch, with a stable `reason` field

**Choice:** Each early `redirectWithLoginFailed(res)` call on the
previewbase's return path gains a structured log with a stable string
`reason` value:

- `state-missing-handoff-target` — `info.state` produced no `handoffTarget`
  and no signed-state fallback decoded.
- `handoff-target-unsafe` — `evaluateHandoffTarget(handoffTarget,
  handoffTargetOriginRegexes)` returned `{ ok: false }`. Sub-reason
  logged: `allowlist-not-configured` (the allowlist is empty) vs
  `origin-not-allowed` (origin doesn't match any pattern) vs
  `missing-or-invalid-url`.
- `handoff-mint-failed` — the call to `mintHandoffTokenFn` threw.
- `oidc-identity-missing` — `user.oidcIdentity.{issuer,subject}` absent.

**Why:** The acceptance criteria explicitly require log-only debuggability.
A stable enumerated `reason` lets us grep one string and identify the
failure class instantly. The `subReason` split distinguishes operational
misconfiguration (`allowlist-not-configured`) from genuine probe attempts
(`origin-not-allowed`).

**Alternative considered:** Free-text log messages. Rejected because they
make grepping/aggregation brittle.

### Decision 4 — Configure the allowlist via `HANDOFF_TARGET_ORIGIN_REGEX`, not Railway env

**Choice:** Source the allowed handoff target origins from a single env
var `HANDOFF_TARGET_ORIGIN_REGEX` (comma-separated regex list, parsed by
the existing `parseOriginRegexes` helper that already drives
`ALLOWED_ORIGIN_REGEX`). The auth router takes the parsed regex list via
`config.handoffTargetOriginRegexes` and forwards it to
`evaluateHandoffTarget(url, allowedOriginRegexes)`. The function reads no
`process.env.*` itself.

When the auth router is constructed with `canMintHandoff = true` but the
regex list is empty, emit one `logger.warn` at startup naming the
consequence (`"handoff requests will be rejected with reason:
handoff-target-unsafe / subReason: allowlist-not-configured until
configured"`). Do *not* abort startup — local dev and tests that don't
exercise the handoff path still need to boot.

**Why:** Encoding `^<service>-<project>-pr-\d+\.up\.railway\.app$` in
code with `RAILWAY_*` env interpolation made the codebase Railway-specific
for no benefit. A regex env var:
- works on any host (Railway, fly.io, self-hosted) without code changes;
- mirrors the existing `ALLOWED_ORIGIN_REGEX` configuration pattern, which
  operators already understand;
- keeps the boundary check pure (testable without setting/unsetting
  `process.env`).

**Alternative considered (1):** Keep Railway env interpolation as a
fallback when `HANDOFF_TARGET_ORIGIN_REGEX` is unset. Rejected — it
preserves Railway-specific behavior in code and makes the test surface
larger. Operators on Railway can construct the regex from
`${{RAILWAY_SERVICE_NAME}}-${{RAILWAY_PROJECT_NAME}}-pr-\d+...` in their
Railway environment configuration; the regex shape is documented in
`PREVIEW_DEPLOYMENT.md`.

**Alternative considered (2):** Two env vars — one for an exact-origin
allowlist (`HANDOFF_TARGET_ORIGINS`) and one for regexes
(`HANDOFF_TARGET_ORIGIN_REGEX`). Rejected — operators can express exact
origins as anchored regexes (`^https://exact\.example\.com$`) without
adding a second config surface.

### Decision 5 — Test the happy path against an in-process Express app, mirroring existing patterns

**Choice:** Add a cascade-test next to
`handoff-login-signup-policy.js` that mounts `createAuthRouter` with a fake
passport strategy (returns a synthetic OIDC user via the same
`passport.authenticate` callback contract used today), drives
`/login/google/return` directly, and asserts the response is a 302 to the
consumer's `/login/google/handoff` URL with the expected token + returnPath.
Cover both cold-start and pre-authenticated cases.

**Why:** This matches the established test style in this repo
(`handoff-login-signup-policy.js`, `safe-redirect-path.js`), avoids spinning
up a real OIDC provider, and is fast enough to run in CI on every PR. Per the
project's `cascade-test` skill, prefer integration coverage at the router
boundary over unit tests of the closure helpers.

**Alternative considered:** Browser-driven Playwright test mocking the
Google OIDC provider. Rejected as out of proportion for a regression net —
the bug surface is on the return-handler branch logic, which is reachable
from a route-level test.

## Risks / Trade-offs

- **[Signed-state introduction creates a new code path that must not regress
  the CLI/extension flows]** → Keep the signed-state branch active only when
  `handoffTarget` is meaningfully in scope: gated behind the same
  `wantsHandoff` predicate. CLI/extension state shapes (`returnToCli`,
  `returnToExtension`) continue to use passport's session-backed state.
  Cover both with the existing `handoff-login-signup-policy.js`-style tests
  to confirm the legacy branches still pass `info.state` through.

- **[A signed self-contained state token weakens CSRF compared to passport's
  session-backed state]** → Mitigate by including `aud` (`oidc-state`),
  `iss` (the previewbase apiOrigin), `exp` (≤5 min), and a single-use
  `jti` recorded in the same `consumeHandoffJti` table that the consumer
  endpoint already uses. Verify these on return before trusting
  `handoffTarget`. Net result is no weaker than the existing handoff token's
  guarantees.

- **[Skipping `req.login` on the previewbase when `handoffTarget` is set
  could surprise a user who happens to also want a previewbase session]** →
  This is by design and matches the proposed behaviour. The previewbase is
  not the user's intended destination here. If they want a session on the
  previewbase, they will start the flow from the previewbase frontend and
  no `handoffTarget` will be present.

- **[Startup warning is purely informational and could be ignored]** →
  Acceptable. The structured per-request `reason: railway-env-missing` log
  will surface the same condition during a real login attempt, so the
  signal is not solely tied to the startup path. Combined we cover both
  pre-deploy validation and post-deploy debugging.

- **[Passport's session middleware ordering could mean the existing `state`
  decode path silently wins over the new signed-state path even when both
  are present]** → The implementation must explicitly check the signed
  state first when `handoffTarget` would otherwise be missing, then fall
  through to passport's `info.state`. Tested directly via the new
  cascade-test.

## Migration Plan

- No data migration. No DB schema changes. No client-side changes.
- Roll out by merging the change. The signed-state branch is additive: until
  a request arrives carrying a signed state, the existing session-backed
  path runs unchanged.
- After deploy, manually exercise both PR-preview-cold and
  PR-preview-with-existing-previewbase-session flows once and confirm the
  new structured logs appear with the expected `reason` values when
  intentionally misconfigured (e.g. clear `HANDOFF_TARGET_ORIGIN_REGEX`
  on the previewbase and watch for
  `subReason: 'allowlist-not-configured'` in the logs).
- Rollback by reverting the commit; previously-issued signed-state tokens
  expire within 5 minutes and have no persistent effect.

## Open Questions

- Should the signed state's `jti` share the same `consumeHandoffJti` table
  the handoff consume endpoint uses, or live in its own table to avoid
  cross-contamination? Working assumption: same table is fine — both are
  short-lived single-use anti-replay tokens scoped to the handoff flow.
  Revisit during apply if the table's primary key constraints make this
  awkward.
- Is there a case where the consumer (PR preview) should *also* fall back
  to a signed state when delegating to the authority, or is the
  authority-side fix sufficient? Working assumption: authority-side only,
  because the consumer-side delegation is a single redirect with no Google
  round trip in between, so its passport `state` is constructed and
  consumed in the same request handler.
