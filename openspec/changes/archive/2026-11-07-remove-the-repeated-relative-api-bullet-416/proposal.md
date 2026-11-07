# Proposal

## Why

In `PREVIEW_DEPLOYMENT.md`, the "Recommended (same domain, path-based routing)"
list ends with the bullet "Frontend will use relative `/api` automatically when
no explicit API URL is configured." The second bullet of the same list already
says this, more precisely and scoped to the frontend build. The repeat adds
nothing and makes the list read as if it were a separate point (issue #416).

## What Changes

- Remove the last bullet of the "Recommended (same domain, path-based routing)"
  list in `PREVIEW_DEPLOYMENT.md`.
- Leave the other three bullets unchanged, including the wording that scopes
  the "do not set `API_URL`" guidance to the frontend build and warns that the
  backend service still needs `API_URL` (required by the
  `pr-preview-auth-handoff` capability's "Documented previewbase configuration"
  requirement).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. This is a documentation-only edit; no specified behaviour changes, so the
change opts out of spec deltas (`skip_specs: true` in `.openspec.yaml`). The
existing `pr-preview-auth-handoff` requirements on `PREVIEW_DEPLOYMENT.md` stay
satisfied by the remaining bullets.

## Impact

- `PREVIEW_DEPLOYMENT.md`: one line removed.
- No code, configuration, tests or UI are affected; no demo recordings needed.
