## 1. Pre-flight: confirm the call graph and existing test fixtures

- [x] 1.1 Re-read `packages/back/routes/shared/github-actions-oidc.js`
      end-to-end and confirm `verifyActionsToken`'s four rejection
      paths map 1:1 to the `reason` enumeration in
      `specs/actions-oidc-login/spec.md`: input-missing,
      JWKS-key-fetch-failed, sig-or-claim-verification-failed,
      repository-claim-mismatch.
- [x] 1.2 Re-read `packages/back/routes/auth.js` ~line 778–805 and
      confirm the route has a `logger` in scope to thread into
      `verifyActionsTokenFn`.
- [x] 1.3 Re-read `packages/back/test/tests/users/auth/actions-oidc-login.js`
      and confirm the test injects `verifyActionsTokenFn` as a stub,
      so the new logger-pass requirement can be asserted via the
      injected stub's call args without invoking the real verifier.
- [x] 1.4 Grep `packages/back/` for `verifyActionsToken(` (production
      call sites) and `verifyActionsTokenFn(` (test sites) to make
      sure no other callers exist that would also need updating.

## 2. Instrument the verifier

- [x] 2.1 In `packages/back/routes/shared/github-actions-oidc.js`,
      change `verifyActionsToken` to accept `{ token, audience,
      allowedRepo, logger }`. Implement a `safeWarn(reason, detail)`
      helper that no-ops when `logger?.warn` is not a function,
      otherwise calls `logger.warn({ reason, expectedAudience:
      audience, expectedRepo: allowedRepo, issuer:
      GITHUB_ACTIONS_ISSUER, ...detail })`.
- [x] 2.2 At the top of the function, if any of `token`, `audience`,
      `allowedRepo` is falsy, call `safeWarn('verifier-input-missing',
      { missing: [<names of falsy inputs>] })` and resolve `null`.
- [x] 2.3 Wrap `getSigningKey` so that when `jwksClient.getSigningKey`
      errors, the error path emits `safeWarn('jwks-key-fetch-failed',
      { kid: header?.kid ?? null, errorName: err.name, errorMessage:
      err.message })` before passing the error through to
      `jwt.verify`'s callback. This is the only way to distinguish a
      JWKS network error from a signature mismatch from the warn,
      because `jwt.verify` collapses both into a generic verify
      error.
- [x] 2.4 In `jwt.verify`'s callback, when `err || !payload || typeof
      payload !== 'object'` and the upstream warn from step 2.3
      hasn't already fired (i.e. err.name is not the
      `jwks-key-fetch-failed` sentinel), call
      `safeWarn('signature-or-claim-verification-failed', {
      jwtErrorName: err?.name ?? null, jwtErrorMessage: err?.message
      ?? null, unverifiedClaims: extractUnverifiedClaims(token) })`
      and resolve `null`.
- [x] 2.5 Implement `extractUnverifiedClaims(token)` using
      `jsonwebtoken.decode(token, { complete: true })`. Return `{ iss,
      aud, sub, repository, exp, alg }` whitelisted from the decoded
      payload/header. Wrap in a try/catch and return `null` if decode
      throws (malformed input shouldn't break the warn).
- [x] 2.6 After `jwt.verify` accepts the token, when `payload.repository
      !== allowedRepo`, call `safeWarn('repository-claim-mismatch', {
      observedRepo: payload.repository ?? null })` and resolve `null`.
- [x] 2.7 Confirm the `jwt.verify` options object
      (`{ issuer: GITHUB_ACTIONS_ISSUER, audience, algorithms:
      ['RS256'] }`) is unchanged — the security-relevant verification
      is not being touched.

## 3. Wire the route through

- [x] 3.1 In `packages/back/routes/auth.js` at the `/login/actions`
      route, pass `logger` into the `verifyActionsTokenFn` call:
      `verifyActionsTokenFn({ token, audience: apiOrigin,
      allowedRepo: githubActionsOidcRepo, logger })`.
- [x] 3.2 Delete the line `logger.warn('Actions OIDC login rejected:
      invalid or unauthorized token')` at ~line 790. The verifier
      now owns the warn.

## 4. Update and extend cascade-tests

- [x] 4.1 In `packages/back/test/tests/users/auth/actions-oidc-login.js`,
      extend the existing "verifyActionsToken is called with apiOrigin
      as audience and configured repo" test so its `capturedArgs`
      assertion also checks `capturedArgs.logger` is the request
      logger (i.e. an object with a `.warn` function).
- [x] 4.2 Add a new test case "POST /login/actions — verifier rejection
      does not emit the old opaque warn at the route": stub
      `verifyActionsTokenFn` to resolve `null`, attach a recording
      logger to the app, request the route, assert the response is
      401 and the recording logger has no `warn` entry containing
      the literal string `invalid or unauthorized`.
- [x] 4.3 Add a sibling cascade-test file
      `packages/back/test/tests/users/auth/actions-oidc-verifier.js`
      that exercises `verifyActionsToken` directly (the real one,
      not the stub). For each of the five spec scenarios:
      - input-missing
      - jwks-key-fetch-failed: inject a fake `jwksClient` via the
        new `createVerifyActionsToken({ jwksClient })` factory whose
        `getSigningKey` calls back with an error (replaces the
        proxyquire/nock approach since neither is a project dep)
      - signature-or-claim-verification-failed: mint a token signed
        with a *different* key (or hand-craft a JWT with deliberately
        wrong audience) and inject a JWKS client returning a valid
        public key for the real issuer so `jwt.verify` rejects on
        audience/sig
      - repository-claim-mismatch: mint a token whose signature
        verifies but `repository` is the wrong value (test private
        key + matching public key in injected JWKS client)
      - no-logger silent rejection: same input as the previous case
        but call without a `logger` and assert no throw + null
        result.
- [x] 4.4 Run `yarn workspace fomoplayer_back cascade-test
      --regex 'actions-oidc'` (or the project's standard cascade-test
      invocation) and confirm all cases pass. Verified all 17 cases
      pass (and the full `users/auth/` suite of 177 tests stays
      green).

## 5. Land the diagnostic and observe

- [x] 5.1 Commit steps 2–4 to master as a single change (per the
      project's commit policy that backend + tests stay together).
      Per user request, landed on side branch
      `diagnose-pr-demo-actions-oidc-401` (commit `6e5b1c36`) and
      pushed to origin — PR to be opened by user, then merged to
      master before the next steps. Original migration plan
      (commit directly to master) was preserved as a single
      bundled commit.
- [ ] 5.2 Rebase the `restyle-settings-sliders` branch (or whichever
      branch currently has the failing PR demo) onto master and
      force-with-lease push, so Railway redeploys the PR preview
      with the diagnostic.
- [ ] 5.3 Wait for the Railway PR preview to finish redeploying.
      Then retrigger `PR Demo Test` on the PR (either
      `gh run rerun --failed <run-id>` against the most recent run
      or push an empty commit).
- [ ] 5.4 Read the Railway log for the new `verifyActionsToken` warn
      attributable to the cascade-test request. Capture the
      structured `reason` value and any associated fields in
      `notes.md` (create the file if it doesn't exist).

## 6. Apply the targeted fix

- [ ] 6.1 Based on the observed `reason` and the diagnostic fields,
      identify the root cause:
      - `signature-or-claim-verification-failed` with `aud` mismatch:
        normalize trailing slashes on backend `apiOrigin` (or
        whichever side has the discrepancy) and document the
        normalization in `routes/auth.js` near the verifier call.
      - `jwks-key-fetch-failed`: investigate Railway's outbound
        connectivity to `token.actions.githubusercontent.com`;
        possibly add a retry or surface a more specific error to
        the workflow.
      - `repository-claim-mismatch`: confirm
        `GITHUB_ACTIONS_OIDC_REPO` matches the actual repo
        (`owner/name`, case-sensitive); fix the env var or the
        comparison.
      - `verifier-input-missing`: trace which input is undefined
        and fix at the source.
- [ ] 6.2 Implement the fix in the same change. Add a regression
      cascade-test under
      `packages/back/test/tests/users/auth/actions-oidc-login.js`
      or the new verifier file that exercises the specific cause
      (e.g. audience-with-trailing-slash matches audience-without,
      or a known-bad repo string is rejected).
- [ ] 6.3 Commit the fix, rebase the PR branch on master again,
      force-with-lease push, and confirm `PR Demo Test` now reaches
      the cascade-test execution phase (i.e. the 401 is gone). The
      cascade-test itself passing all the way through is the
      success signal for the broader PR-demo goal, but is out of
      scope for the spec assertions of this change.

## 7. Verify and clean up

- [ ] 7.1 Confirm the new and existing cascade-tests in the `users/auth/`
      suite all pass: at minimum
      `actions-oidc-login.js`, the new `actions-oidc-verifier.js`,
      and the existing handoff-related suites that share the
      `createAuthRouter` factory (`handoff-login-return.js`,
      `handoff-login-signup-policy.js`, `config-handoff-fail-fast.js`,
      `config-preview-access.js`, `api-key-exchange.js`).
- [ ] 7.2 Verify with the user that the `PR Demo Test` workflow on the
      open PR now reaches video upload (the demo-video artifact
      named `demo-video-pr-<n>` is attached to the workflow run).
      This is the original goal stated in the handoff document.
- [ ] 7.3 Update `notes.md` with the final observed `reason`, the fix
      applied, and any surprises encountered for the archive step.
- [ ] 7.4 If the slider restyle PR is no longer needed as a test
      vehicle once the workflow is green, coordinate with the user
      on whether to merge, close, or keep it open for the demo
      recording artifact.

## 8. Backlog hygiene

- [ ] 8.1 No backlog symlink to move (this change came from a direct
      user request via `.scratch/pr-demo-oidc-401-handoff.md`, not a
      tracked backlog item). Confirm and skip.
- [ ] 8.2 If anything surprising surfaces during implementation
      (unexpected verifier inputs, additional rejection paths in
      `jsonwebtoken`, JWKS caching behaviour, etc.) capture it in
      the change's `notes.md` for the archive step.
