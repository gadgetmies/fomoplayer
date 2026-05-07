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
  line that names the tripped guard (`handoff-target-unsafe` with
  `subReason: allowlist-not-configured` or `origin-not-allowed`,
  `handoff-mint-failed`, `oidc-identity-missing`).
- A cascade-test covers the handoff happy path (cold-start) and a regression
  test covers the existing-previewbase-session case using an in-process
  Express app, mirroring `handoff-login-signup-policy.js`.
- `PREVIEW_DEPLOYMENT.md` documents that the previewbase needs
  `ALLOWED_PREVIEW_ORIGIN_REGEX` set to a regex matching its allowed
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

### Decision 2 — Replace passport's session-backed state store with a stateless signed-JWT store

**Choice:** Configure `passport-openidconnect`'s OpenIDStrategy with the
`store:` option pointing at a custom `StatelessStateStore`. The store
implements the strategy's two-method interface
(`store(req, ctx, appState, meta, cb)` and `verify(req, handle, cb)`) by
signing `{ ctx, appState }` as a JWT with `config.sessionSecret`, HS256,
`aud=oidc-state`, 10 min TTL. The JWT *is* the OIDC `state` query
parameter — no session lookup is required on either side.

**Why:** This is the actual fix for the observed bug. The original
attempt to side-channel `handoffTarget` in a cookie was *also* defeated
because passport-openidconnect's default `SessionStateStore.verify`
fails *before* our return handler runs, with `"Unable to verify
authorization request state."`, when `req.session[<key>]` is empty. By
the time our `(err, user, info)` callback fires, `user = false` and the
strategy is already pointing at the failure path. The cookie was dead
code in the failure case.

`StatelessStateStore` decouples state delivery from express-session
entirely. The state survives any scenario where the OIDC redirect
itself reaches the backend, because Google echoes the JWT verbatim in
the `state` query parameter. Session loss, pg-session row eviction,
and `SameSite` rejections of the session cookie on the cross-site OIDC
return all become non-issues for state delivery.

**CSRF properties:**
- Original session-backed handle: random 24-byte string, single-use
  (deleted on lookup). Forgery requires guessing the random value.
- Stateless signed JWT: HMAC-signed with a server-side secret +
  `aud=oidc-state` + `exp`. Forgery requires the secret. Replay within
  the TTL is bounded by Google's single-use authorization `code` —
  resubmitting the same `(code, state)` pair fails on the second
  submit, so the practical attack surface is no larger than before.

**Alternatives considered:**

1. *Catch the "state verification failed" passport error in the return
   handler and proceed with the cookie's payload via a manual OIDC code
   exchange.* Rejected — re-implementing parts of
   passport-openidconnect (token endpoint call, ID-token verification)
   is invasive and error-prone, and we'd run two parallel state
   verification mechanisms.
2. *Keep the cookie sidechannel and disable passport's state check via
   `state: false` in strategy options.* Rejected — disabling the state
   check globally affects CLI and extension flows that rely on
   `info.state` to route the return-handler branches. We'd need to
   manually re-verify state for all flows.
3. *Switch to a different OIDC library that lets us decline state
   storage per-call.* Rejected as too disruptive; passport-openidconnect
   already exposes the `store:` extension point.

**Side-effect on CLI / extension flows:** Their `state: { returnToCli,
... }` / `state: { returnToExtension, ... }` payloads now ride the JWT
the same way handoff state does. No code change needed in those flows;
they just stop depending on session for OIDC state delivery, which is
strictly a robustness improvement. Other session-stored keys
(`req.session.cliCallbackPort`, `req.session.extensionId`, etc.) are
unaffected — they're written and read on the same backend instance and
don't cross the OIDC round trip.

**Secret choice:** `config.sessionSecret` is reused. It's already
deployed on every backend, scoped exactly the same way as the original
session-backed state, and rotating it invalidates outstanding state
JWTs the same way it invalidates outstanding session cookies. Using a
dedicated `OIDC_STATE_SECRET` would add another env var without
changing the rotation story.

### Decision 3 — Emit one structured `logger.warn` per failure branch, with a stable `reason` field

**Choice:** Each early `redirectWithLoginFailed(res)` call on the
previewbase's return path gains a structured log with a stable string
`reason` value:

- `handoff-target-unsafe` — `evaluateHandoffTarget(handoffTarget,
  allowedPreviewOriginRegexes)` returned `{ ok: false }`. Sub-reason
  logged: `allowlist-not-configured` (the allowlist is empty) vs
  `origin-not-allowed` (origin doesn't match any pattern) vs
  `missing-or-invalid-url`.
- `handoff-mint-failed` — the call to `mintHandoffTokenFn` threw.
- `oidc-identity-missing` — `user.oidcIdentity.{issuer,subject}` absent.

State-verification failures (tampered, expired, or malformed `state`
JWT) are reported by `passport-openidconnect` itself before reaching
this branch — they surface as the existing
`OIDC authentication produced no user` log line with
`failureInfo.message` set by `StatelessStateStore.verify`. No
`state-missing-handoff-target` reason is needed anymore: with the
stateless store, the state either verifies (and `appState` carries
`handoffTarget`) or it doesn't (and the strategy fails before our
handoff branch runs).

**Why:** The acceptance criteria explicitly require log-only debuggability.
A stable enumerated `reason` lets us grep one string and identify the
failure class instantly. The `subReason` split distinguishes operational
misconfiguration (`allowlist-not-configured`) from genuine probe attempts
(`origin-not-allowed`).

**Alternative considered:** Free-text log messages. Rejected because they
make grepping/aggregation brittle.

### Decision 4 — Reuse existing config: `ALLOWED_PREVIEW_ORIGIN_REGEX` and `AUTH_API_URL`

**Choice:** Configure handoff via env vars that already exist in the
codebase rather than adding new ones:

- **Handoff target allowlist** reuses `ALLOWED_PREVIEW_ORIGIN_REGEX`.
  `evaluateHandoffTarget(url, allowedOriginRegexes)` takes the regex
  list as a parameter; the auth router sources it from
  `config.allowedPreviewOriginRegexes` (already parsed by
  `parseOriginRegexes` for CORS use). The function reads no
  `process.env.*` itself.
- **Handoff URL** is derived from `AUTH_API_URL`. Consumers already set
  `AUTH_API_URL=https://<authority>/api` to point cross-backend auth
  calls at the authority; the handoff URL becomes
  `${AUTH_API_URL}/auth/login/google` and the authority origin is the
  origin of `AUTH_API_URL`. There is no separate `OIDC_HANDOFF_URL`.
- **Consumer-ness detection** keys on `AUTH_API_URL` resolving to a
  different origin than this backend's `apiOrigin`, plus
  `OIDC_HANDOFF_SECRET` being set. Self-referential `AUTH_API_URL`
  (or unset) means the backend is the authority and skips delegation.

When the auth router is constructed with `canMintHandoff = true` but
`config.allowedPreviewOriginRegexes` is empty, emit one
`logger.warn` at startup naming the consequence (`"handoff requests
will be rejected with reason: handoff-target-unsafe / subReason:
allowlist-not-configured until configured"`). Do *not* abort startup —
local dev and tests that don't exercise the handoff path still need to
boot.

**Why:**

The Railway-specific allowlist (built in code from
`RAILWAY_SERVICE_NAME` + `RAILWAY_PROJECT_NAME`) made the codebase
Railway-specific for no benefit. The first consolidation introduced a
new env var (`HANDOFF_TARGET_ORIGIN_REGEX`) but operators were already
setting `ALLOWED_PREVIEW_ORIGIN_REGEX` for CORS — two parallel
allowlists for the same set of preview origins is busywork and a
drift risk. Reusing one regex list closes that gap.

The same logic applies to `OIDC_HANDOFF_URL`: PR previews already set
`AUTH_API_URL` to the authority, so the handoff URL was always
`${AUTH_API_URL}/auth/login/google` in practice. Two env vars that
must agree are one too many — drop the redundant one.

CORS allowlist and handoff allowlist are technically different
security boundaries, but in practice the same set of origins should
appear in both for any sane PR preview deployment, and the handoff
has its own additional gate (the shared `OIDC_HANDOFF_SECRET`) that
prevents an arbitrary CORS-allowed origin from receiving
authentication tokens it can actually use.

**Alternative considered:** Keep `HANDOFF_TARGET_ORIGIN_REGEX` as a
separate var so operators can configure CORS and handoff allowlists
independently. Rejected — the boundaries we're protecting in this
codebase are the same set of origins (PR previews), and the second
gate (`OIDC_HANDOFF_SECRET`) already provides defense-in-depth.

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
  intentionally misconfigured (e.g. clear `ALLOWED_PREVIEW_ORIGIN_REGEX`
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
