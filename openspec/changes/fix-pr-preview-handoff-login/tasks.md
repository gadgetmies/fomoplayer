## 1. Signed OIDC state helper

- [x] 1.1 Add a small helper module (e.g.
      `packages/back/routes/shared/oidc-state-token.js`) exposing
      `signOidcState({ secret, issuer, returnPath, handoffTarget })` and
      `verifyOidcState({ token, secret, issuer })`. Use HMAC-SHA256 with
      `aud: 'oidc-state'`, `exp` ≤ 5 minutes, and a random `jti`.
- [x] 1.2 Add unit-style cascade-tests covering: roundtrip success,
      tampered signature, expired token, wrong audience, wrong issuer.

## 2. Authority `/login/google` (request-side handoff target propagation)

- [x] 2.1 In `packages/back/routes/auth.js` `/login/google`, when
      `requestedHandoffTarget` is present and accepted, build a signed
      state token via `signOidcState` and pass it as the OIDC `state`
      alongside the existing passport-managed object so that, on return,
      we can recover `{ returnPath, handoffTarget }` even if the
      session-backed entry is gone.
- [x] 2.2 Keep CLI / extension paths unchanged: signed-state branch only
      activates when `handoffTarget` is in scope.

## 3. Authority `/login/google/return` (handoff branch hardening)

- [x] 3.1 Resolve `{ returnPath, handoffTarget }` by trying the signed
      state first (if present in the request's incoming `state`), then
      falling back to `info?.state` from passport. Log which path won
      with `reason: 'state-resolved-via-signed' | 'state-resolved-via-passport'`
      at debug level for observability.
- [x] 3.2 If `handoffTarget` is set but cannot be resolved from either
      source, log
      `logger.warn({ reason: 'state-missing-handoff-target', ... })`
      and `redirectWithLoginFailed(res)`.
- [x] 3.3 When `handoffTarget` is set and resolved, take the handoff
      branch UNCONDITIONALLY — do not call `req.login` for the authority
      session, even if `req.user` already exists from a prior
      authority-side session.
- [x] 3.4 Refactor each `redirectWithLoginFailed(res)` inside the handoff
      branch to be preceded by a structured `logger.warn` with the
      enumerated `reason` values from the spec
      (`handoff-target-unsafe` with `subReason`, `handoff-mint-failed`,
      `oidc-identity-missing`).

## 4. Handoff allowlist via env var + diagnostic context

- [x] 4.1 Add `HANDOFF_TARGET_ORIGIN_REGEX` parsing to
      `packages/back/config.js` (reuse `parseOriginRegexes` from
      `cors-origin.js`). Expose as
      `config.handoffTargetOriginRegexes`.
- [x] 4.2 Refactor `packages/back/routes/shared/safe-redirect.js` so
      `evaluateHandoffTarget(url, allowedOriginRegexes)` is pure (no
      `process.env.*` reads) and returns a stable
      `{ ok, subReason }` shape with subReasons
      `allowlist-not-configured` / `origin-not-allowed` /
      `missing-or-invalid-url`. `isSafeHandoffTarget` becomes a thin
      wrapper.
- [x] 4.3 Thread `config.handoffTargetOriginRegexes` through every
      `evaluateHandoffTarget` callsite in `packages/back/routes/auth.js`.
- [x] 4.4 Update the existing `safe-redirect-path.js` cascade-tests to
      use the new signature and the new subReason names; preserve
      behaviour of all path-checking cases.

## 5. Startup warning for missing handoff allowlist on the issuer

- [x] 5.1 In `createAuthRouter`, detect
      `canMintHandoff && handoffTargetOriginRegexes.length === 0` and
      emit a single startup `logger.warn` referencing
      `HANDOFF_TARGET_ORIGIN_REGEX` and the resulting failure
      `reason: handoff-target-unsafe / subReason: allowlist-not-configured`.
- [x] 5.2 Ensure the warning is gated only on `canMintHandoff`, so
      backends that don't act as handoff issuers (no
      `OIDC_HANDOFF_SECRET`) don't see the warning even with an empty
      allowlist.

## 6. Cascade-test coverage for the handoff happy path

- [x] 6.1 Add `packages/back/test/tests/users/auth/handoff-login-return.js`
      mirroring the structure of `handoff-login-signup-policy.js`.
      Mount `createAuthRouter` with a fake passport strategy that
      synthesises an OIDC user, drive `/login/google/return`, and assert
      the response is a 302 to
      `https://<consumer>/api/auth/login/google/handoff?token=<...>&returnPath=<...>`.
- [x] 6.2 Add a scenario where the same fake user is "already logged in"
      to the authority before `/login/google/return` is invoked, and
      assert the response still 302s to the consumer's handoff URL and
      `req.login` is not invoked for the user a second time on the
      authority.
- [x] 6.3 Add a scenario where the resolved state lacks `handoffTarget`
      and confirm the response 302s to the login-failed URL with a
      `state-missing-handoff-target` log captured.
- [x] 6.4 Add a scenario where `handoffTargetOriginRegexes` is empty and
      confirm the warn log carries
      `reason: 'handoff-target-unsafe', subReason: 'allowlist-not-configured'`.
      Add a parallel scenario where the regex doesn't match the
      requested origin, expecting `subReason: 'origin-not-allowed'`.
- [x] 6.5 Add a scenario covering the `consumer-side` `/login/google`
      delegation: a 302 to the authority's `/login/google` with
      `returnPath` and `handoffTarget` set to the consumer's request
      origin.

## 7. Documentation update

- [x] 7.1 In `PREVIEW_DEPLOYMENT.md`, add a "Handoff target allowlist"
      subsection under the OIDC / handoff section documenting
      `HANDOFF_TARGET_ORIGIN_REGEX`, including an example regex shape
      for Railway-hosted PR previews and the structured failure-log
      values that fire when the allowlist is missing or doesn't match.
- [x] 7.2 Cross-link the new section from the existing handoff
      configuration section so future readers see it on first scan.
- [x] 7.3 Update `docs/auth/oidc-login-flow.md`: add
      `oidc-state-token.js` to code pointers, document the signed-state
      cookie + unconditional-handoff-branch behaviour, table the
      structured `reason` / `subReason` log values, replace the
      `RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME` references in the
      per-environment-configuration section with
      `HANDOFF_TARGET_ORIGIN_REGEX`.

## 8. Manual verification (post-merge, on Railway)

> Deferred to post-merge — these steps require a deployed previewbase and a
> live PR preview environment. Items 1–7 above are implemented and covered
> by automated tests; the cookie sidechannel and structured logs are
> deployed-but-defensive (they activate when the underlying session-loss
> bug occurs in the wild). Run these manual checks after the change is
> merged and Railway picks up the new previewbase build.

- [ ] 8.1 With `HANDOFF_TARGET_ORIGIN_REGEX` set on the previewbase, log
      in from a PR preview that has no previewbase session. Confirm the
      user lands authenticated on the PR preview origin on the requested
      `returnPath`.
- [ ] 8.2 With the previewbase already holding a session for the same
      Google account, log in again from a PR preview. Confirm the user
      lands authenticated on the PR preview origin (not the previewbase),
      and that the previewbase session is still independently alive.
- [ ] 8.3 Temporarily unset `HANDOFF_TARGET_ORIGIN_REGEX` on the
      previewbase, attempt a PR preview login, and confirm the previewbase
      logs include
      `reason: 'handoff-target-unsafe', subReason: 'allowlist-not-configured'`.
      Restore the env var afterward.
