## 1. Verify scope before editing

- [x] 1.1 Re-read `packages/back/config.js` end-to-end, confirm the
      `isPreviewEnv` line is at line 39 (after `validateAuthConfig`)
      and that no other consumer of the handoff values runs before
      the validator call. Confirmed.
- [x] 1.2 Grep `packages/back/` for `oidcHandoffSecret`,
      `oidcHandoffUrl`, `oidcHandoffAuthorityOrigin`, and
      `allowedPreviewOriginRegexes` to confirm they are only consumed
      via `config.X` (so gating at `config.js` is sufficient and no
      direct `process.env.*` reads bypass the gate). Production
      consumers: `routes/auth.js` (reads via `config` factory arg)
      and `routes/shared/auth-config-validator.js` (receives from
      config.js call). Both downstream of config.js. ✓
- [x] 1.3 Grep `packages/back/test/` for tests that pass
      `oidcHandoffSecret` / `oidcHandoffUrl` directly into routes
      (rather than reading from `config`) to make sure they still
      exercise the handoff branches without needing `PREVIEW_ENV`
      threaded through. Confirmed: `config-handoff-fail-fast.js`,
      `handoff-login-signup-policy.js`, `handoff-login-return.js`,
      `actions-oidc-login.js` all build their own `config` objects
      with explicit handoff values. They bypass the gate by
      construction — no test breakage from this change.

## 2. Apply the gate at the config layer

- [x] 2.1 In `packages/back/config.js`, move the `isPreviewEnv = process.env.PREVIEW_ENV === 'true'`
      line to before the `validateAuthConfig` call. Done — now at line 17.
- [x] 2.2 Wrap the four handoff-related derivations in
      `isPreviewEnv ? <real value> : <off>`:
      - `oidcHandoffSecret = isPreviewEnv ? (process.env.OIDC_HANDOFF_SECRET || undefined) : undefined`
      - `oidcHandoffAuthorityOrigin = isPreviewEnv ? authApiOrigin : undefined`
      - `oidcHandoffUrl = isPreviewEnv && authApiURL ? \`${authApiURL}/auth/login/google\` : undefined`
      - `allowedPreviewOriginRegexes = isPreviewEnv ? parseOriginRegexes(process.env.ALLOWED_PREVIEW_ORIGIN_REGEX) : []`
- [x] 2.3 Confirm `validateAuthConfig({ oidcHandoffSecret, apiOrigin, oidcHandoffAuthorityOrigin, allowedPreviewOriginRegexes })`
      now sees `undefined` / `[]` when `!isPreviewEnv` — both the
      "issuer enabled but no allowlist" and "looks like consumer but
      no secret" branches short-circuit.
- [x] 2.4 Verify the existing `PREVIEW_ALLOWED_GOOGLE_SUBS` check
      (`config.js:46-48`) still fires correctly — it's already gated
      on `isPreviewEnv` so no change needed; just re-read the
      ordering after the `isPreviewEnv` move. Confirmed: `isPreviewEnv`
      is computed once at line 17 and reused throughout.

## 3. Add tests

- [x] 3.1 In `packages/back/test/tests/users/auth/config-preview-access.js`
      (the existing config-loading test file), add a test case:
      `PREVIEW_ENV` unset + `AUTH_API_URL` set to a different origin
      than the backend's apiOrigin + no `OIDC_HANDOFF_SECRET` →
      `require('../../../../config')` loads cleanly (no throw) and
      the exported `oidcHandoffSecret`, `oidcHandoffUrl`,
      `oidcHandoffAuthorityOrigin` are all `undefined`,
      `allowedPreviewOriginRegexes` is `[]`.
- [x] 3.2 Add a second test case: `PREVIEW_ENV` unset +
      `OIDC_HANDOFF_SECRET` set + `ALLOWED_PREVIEW_ORIGIN_REGEX` set
      → config loads cleanly, exported `oidcHandoffSecret` is
      `undefined`, `allowedPreviewOriginRegexes` is `[]`. Confirms
      stale shell env vars don't leak into local-dev config.
- [x] 3.3 Add a third test case: `PREVIEW_ENV=true` +
      `OIDC_HANDOFF_SECRET` set + `ALLOWED_PREVIEW_ORIGIN_REGEX` set
      + matching `AUTH_API_URL` → config loads, `oidcHandoffSecret`
      is the env value, `allowedPreviewOriginRegexes` is the parsed
      list. Confirms the opt-in path still works.
- [x] 3.4 Confirm by mutation: temporarily revert the gate (force
      handoff vars on regardless of `PREVIEW_ENV`) and re-run the
      new tests — they should fail. Restore the gate. Verified:
      - With gate removed, "config loads cleanly when PREVIEW_ENV
        unset and AUTH_API_URL differs" fails (validator throws
        the consumer-without-secret error).
      - "stale handoff env vars are ignored" fails (oidcHandoffSecret
        leaks through as `'leaked-from-shell'`).
      - The opt-in test still passes (unaffected by the gate).

## 4. Document the local-dev workflow

- [x] 4.1 In `docs/auth/oidc-login-flow.md`, add a "Testing handoff
      locally" section covering:
      - the default behaviour (no env vars set → handoff is dormant,
        backend boots cleanly even with mismatched
        `apiOrigin`/`AUTH_API_URL`),
      - how to opt into consumer-side testing (`PREVIEW_ENV=true`,
        `OIDC_HANDOFF_SECRET` matching the test authority,
        `AUTH_API_URL` pointing at the test authority), with the note
        that the test authority must have the local origin
        (e.g. `^http://localhost:\\d+$`) in its
        `ALLOWED_PREVIEW_ORIGIN_REGEX`,
      - how to opt into authority-side testing
        (`PREVIEW_ENV=true`, `OIDC_HANDOFF_SECRET`,
        `ALLOWED_PREVIEW_ORIGIN_REGEX` covering the test consumer).
- [x] 4.2 In `PREVIEW_DEPLOYMENT.md`, add a one-line note in the
      "PR-preview consumer configuration" section affirming that
      `PREVIEW_ENV=true` is required for handoff behaviour to
      activate (it already documents the env var indirectly via the
      Google sub allowlist; this just makes the dependency
      explicit). Added as a new first bullet: explains the gate and
      that PR previews inherit `PREVIEW_ENV=true` from the
      previewbase by default.

## 5. Run and verify

- [x] 5.1 Run the new config-preview-access test cases plus the
      existing 16 `handoff-login-return` cascade-tests, the 12
      `oidc-state-store` tests, and the 5 `handoff-token` tests.
      All must pass. Confirmed: full `users/auth/` suite —
      167/167 tests pass, including 4 of `api-key-exchange.js` after
      opting that test into `PREVIEW_ENV=true` via a new `env`
      option on `startServer`. The opt-in matches the design
      (handoff endpoints require `PREVIEW_ENV=true` to activate).
- [ ] 5.2 Smoke-check: with no handoff env vars set in your local
      `.env.development`, `npm run start` in `packages/back`
      starts cleanly with the backend on a different port from the
      frontend. (Manual verification step at run-time.)
- [ ] 5.3 Smoke-check: set `PREVIEW_ENV=true` plus the other
      handoff vars in `.env.development` (or shell env), restart —
      `validateAuthConfig` either accepts the config or fails with
      the same errors a real preview deployment would. (Manual
      verification step at run-time.)

## 6. Backlog hygiene

- [x] 6.1 No backlog symlink to move (this change came from a direct
      user request, not a tracked backlog item). Confirmed and skipped.
- [x] 6.2 If anything surprising surfaces during implementation
      (unexpected env-var reads, additional gate sites, etc.),
      capture it in the change's `notes.md` (create the file if it
      doesn't exist) for the archive step. Captured: design decisions,
      rejected approaches, and the api-key-exchange test infrastructure
      surprise (extended `startServer` with an `env` option to opt
      that test into `PREVIEW_ENV=true`).
