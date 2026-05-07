---
id: 031
title: Fix handoff login from PR preview environments
effort: M
created: 2026-05-06
---

# Fix handoff login from PR preview environments

## Why

Logging in from a PR preview environment (e.g.
`https://fomoplayer-fomoplayer-pr-NNN.up.railway.app`) is broken. The PR
preview is configured as a handoff *consumer* and the previewbase
(`https://<previewbase-host>`) acts as the OIDC
*authority*, but the round trip never completes back to the PR preview.

Two reproducible failure modes:

1. **User is already logged into the previewbase.** Clicking the login link
   on the PR preview ends with the user authenticated against the
   previewbase. No session is established on the PR preview, no handoff
   token is delivered to it, and the user never returns to the PR preview
   they started from.
2. **User is not logged into the previewbase.** The Google OIDC round trip
   completes against the previewbase, but the user lands on
   `https://<previewbase-host>/?loginFailed=true` —
   the *previewbase's* login-failed page, not the PR preview's. So the
   failure is happening inside the previewbase callback (or the token
   mint/redirect that follows it) rather than on the PR preview's
   handoff-consume endpoint.

The expected end state in both cases is: the user lands back on the PR
preview origin they started from, authenticated, on `returnPath`.

## Reproduction

1. From a PR preview, click the login link, e.g.
   `https://fomoplayer-fomoplayer-pr-NNN.up.railway.app/api/auth/login/google?returnPath=%2F`.
2. The PR preview redirects to the previewbase's
   `/api/auth/login/google` with `returnPath` and
   `handoffTarget=<pr-preview-origin>`.
3. The previewbase starts an OIDC flow against Google with
   `redirect_uri=https://<previewbase-host>/api/auth/login/google/return`.
4. Google redirects the browser back to that `/return` endpoint.
5. **Observed:** the browser ends up at
   `https://<previewbase-host>/?loginFailed=true`
   (or, if already logged in to the previewbase, a logged-in previewbase
   session) instead of being redirected to
   `https://fomoplayer-fomoplayer-pr-NNN.up.railway.app/api/auth/login/google/handoff?token=…&returnPath=%2F`.

## What

- Make the handoff round trip work end-to-end so a user starting from a
  PR preview ends authenticated on the same PR preview origin, on
  `returnPath`.
- Cover both cold-start (no existing previewbase session) and the case
  where the previewbase already has a session for that user — the
  presence of an existing previewbase session must not swallow the
  handoff.
- Add diagnostic logging on the previewbase side that makes it clear
  *which* branch the failure took (state lost, handoff target invalid,
  token mint failed, etc.) so future regressions are debuggable from
  Railway logs alone.

## Acceptance criteria

- [ ] Starting from a PR preview login link with no previewbase session,
      completing the Google OIDC flow lands the user on the originating
      PR preview origin, authenticated, on the requested `returnPath`.
- [ ] Same flow with an existing previewbase session also lands the user
      on the originating PR preview, not on the previewbase. The
      previewbase's session state is irrelevant to the outcome.
- [ ] Hitting `loginFailed=true` on the *previewbase* during a PR
      preview login flow no longer happens for the success path. If the
      flow does fail, the previewbase logs identify which guard was
      tripped (state missing, handoff target rejected, mint failed,
      identity missing).
- [ ] An automated test (browser or integration) covers the cross-origin
      handoff happy path so this regresses loudly.

## Code pointers

- `packages/back/routes/auth.js:131` — `/login/google` on the
  previewbase reads `handoffTarget` from the query and stores it in
  passport's `state`. Verify the state survives the OIDC round trip
  (session cookie behaviour on `up.railway.app` subdomains, SameSite
  settings) — losing it would explain the previewbase staying as the
  terminal origin.
- `packages/back/routes/auth.js:539` — `/login/google/return` reads
  `info.state` and branches on `wantsHandoff`. If `handoffTarget` is
  missing here the user gets logged into the previewbase instead of
  being handed off; that matches failure mode 1.
- `packages/back/routes/auth.js:577` — handoff guards
  (`canMintHandoff`, `isSafeHandoffTarget(handoffTarget)`) and OIDC
  identity check. Any of these failing produces a
  `redirectWithLoginFailed(res)` on the previewbase, which matches
  failure mode 2. The existing `logger.warn` already records which one
  tripped — check Railway logs for the previewbase during a failed run.
- `packages/back/routes/shared/safe-redirect.js:25` —
  `isSafeHandoffTarget` requires `RAILWAY_SERVICE_NAME` and
  `RAILWAY_PROJECT_NAME` env vars on the previewbase and matches the
  hostname against `^<service>-<project>-pr-\d+\.up\.railway\.app$`.
  If those env vars aren't set on the previewbase, every PR preview
  hostname is rejected.
- `packages/back/routes/auth.js:100` — `isSelfReferentialHandoffUrl`
  and `isHandoffConsumerConfigured` gate the delegation behaviour on
  the PR preview side. Confirm both PR preview and previewbase have
  their handoff env (`oidcHandoffUrl`, `oidcHandoffAuthorityOrigin`,
  `oidcHandoffSecret`) wired correctly for their respective roles.
- `packages/back/routes/auth.js:626` — `/login/google/handoff` consumer
  endpoint on the PR preview side. Once the previewbase redirect is
  fixed this path needs to actually be reached and verified.

## Out of scope

- Reworking the handoff token format or rotating the handoff secret.
- Changes to the CLI or browser-extension login flows (separate paths
  on the same router).

## Open questions

- Is the previewbase actually receiving `handoffTarget` in
  `info.state` on the OIDC return, or is the session being lost across
  the Google round trip? Check Railway previewbase logs for the
  `Handoff requested but cannot be fulfilled` warning vs. silent
  fallthrough.
- Are `RAILWAY_SERVICE_NAME` and `RAILWAY_PROJECT_NAME` set on the
  previewbase service? Without them every PR preview hostname is
  rejected by `isSafeHandoffTarget`.
- Does Railway's preview deployment set a session cookie scoped in a
  way that survives the Google round trip on the previewbase host?
