## 1. Read the affected docs

- [x] 1.1 Read `PREVIEW_DEPLOYMENT.md` end-to-end and locate (a) the
       "Recommended (same domain, path-based routing)" block and (b) the
       "PR-preview consumer configuration (handoff target)" section.
- [x] 1.2 Read `docs/auth/oidc-login-flow.md` and locate the consumer
       per-environment configuration section.
- [x] 1.3 Skim `packages/back/config.js` (`apiURL = resolveServiceURL(...)`)
       and `packages/back/routes/auth.js` mint (`audience = targetOrigin`)
       and verify (`audience: apiOrigin`) sites to confirm the
       prerequisite wording in the docs uses the same names as the code.

## 2. Disambiguate the "Recommended" block

- [x] 2.1 In `PREVIEW_DEPLOYMENT.md`'s "Recommended (same domain,
       path-based routing)" block, scope the "do not set `API_URL`"
       guidance to the **frontend build** explicitly, with a one-line
       callout that this does NOT apply to the backend service.
- [x] 2.2 Make the callout grep-able (e.g. include the literal phrase
       "frontend build" so a reader skim-searching can land on it).

## 3. Document the consumer apiOrigin requirement in PREVIEW_DEPLOYMENT.md

- [x] 3.1 In `PREVIEW_DEPLOYMENT.md`'s "PR-preview consumer
       configuration (handoff target)" section, state the prerequisite:
       the backend's `apiOrigin` MUST equal the service's public origin.
- [x] 3.2 Name the practical mechanism: set `API_URL` (or `IP`+`PORT`) on
       the **backend service** so it resolves to the public origin.
- [x] 3.3 Name the failure mode that ensues if the prerequisite is
       violated: the handoff token audience check at
       `/login/google/handoff` silently rejects every otherwise-valid
       token and the user lands on `?loginFailed=true`.

## 4. Mirror the caveat in docs/auth/oidc-login-flow.md

- [x] 4.1 In `docs/auth/oidc-login-flow.md`'s consumer per-environment
       configuration section, surface the same `apiOrigin == public
       origin` prerequisite, briefer than the deployment doc but pointing
       at it for the full operator-facing detail.

## 5. Verify against the spec

- [x] 5.1 Re-read the four scenarios under
       "Documented previewbase and consumer configuration" in
       `openspec/changes/document-consumer-api-origin-requirement/specs/pr-preview-auth-handoff/spec.md`
       and confirm each is satisfied by the docs as written.
- [x] 5.2 `openspec validate document-consumer-api-origin-requirement` (or
       equivalent) passes.

## 6. Backlog hygiene

- [ ] 6.1 Move
       `backlog/todo/a-035-document-consumer-api-origin-requirement` to
       `backlog/done/035-document-consumer-api-origin-requirement` once
       the change is archived. (Deferred to archive step.)
- [x] 6.2 Capture any operator-experience follow-ups (e.g. the open
       question on `validateAuthConfig` extending to fail-fast on
       localhost-shaped `apiOrigin` in deployed envs) as a new backlog
       item if the docs change alone proves insufficient in practice.
       Not yet triggered: docs change is the planned remedy, no
       evidence yet that operator UX needs more. If a future
       deployment still falls into this hole, file a follow-up at
       that point.
