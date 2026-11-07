# Design

## Context

The "Recommended (same domain, path-based routing)" block in
`PREVIEW_DEPLOYMENT.md` has four bullets. Bullet two ("For the **frontend
build** (not the backend service): do not set `API_URL`. Without it, the
frontend bundle uses relative `/api` automatically.") and bullet four
("Frontend will use relative `/api` automatically when no explicit API URL is
configured.") state the same fact.

## Goals / Non-Goals

**Goals:** remove the duplicate statement.

**Non-Goals:** rewording the remaining bullets. Bullet three's frontend-versus-
backend wording was added deliberately by the archived change
`document-consumer-api-origin-requirement` and is required by the
`pr-preview-auth-handoff` spec.

## Decisions

- **Delete bullet four only.** Bullet two is the more precise statement (it
  names `API_URL` and scopes it to the frontend build), so it is the one to keep.
  Alternative considered: also folding bullet three into bullet two — rejected
  as beyond the issue and touching spec-required wording.
- **No spec delta.** Documentation-only, no behaviour change; the change sets
  `skip_specs: true` rather than inventing a requirement.

## Risks / Trade-offs

None of note; a reader loses no information because bullet two remains.
