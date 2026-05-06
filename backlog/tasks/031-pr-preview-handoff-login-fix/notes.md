# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-06_ — Treat both failure modes (already-logged-in
  previewbase ⇒ wrong terminal origin; cold previewbase ⇒
  `loginFailed=true` on previewbase) as a single bug. Both point at
  the previewbase's OIDC return failing to deliver the handoff
  redirect; investigating one is likely to surface the other.

## Rejected approaches

- _YYYY-MM-DD_ — what was tried, why it didn't work. Save the next
  session from retrying it.

## Open threads

- The Google OIDC `state` parameter observed on a failing run is a
  short opaque token, which is consistent with passport storing the
  real `{ returnPath, handoffTarget }` in the session and only sending
  a lookup key to Google. That makes session persistence on the
  previewbase the prime suspect.
- Verify `RAILWAY_SERVICE_NAME` / `RAILWAY_PROJECT_NAME` are present
  on the *previewbase* service (not just the PR previews) — without
  them `isSafeHandoffTarget` rejects every PR preview hostname before
  the mint step.

## Session log

- _2026-05-06_ — Item created from a live reproduction. Captured both
  failure modes and the relevant code pointers in `README.md`. No
  code changes yet.
