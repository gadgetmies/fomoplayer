# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-07_ — Default to remove now, re-add intentionally if a
  use case emerges. The endpoint accepts a self-issued handoff token
  shape (`iss == aud == apiOrigin`) that no current code path mints.
  Keeping it costs auth-surface review effort with no compensating
  benefit.

## Rejected approaches

- _YYYY-MM-DD_ — what was tried, why it didn't work.

## Open threads

- Verify no out-of-tree CLI tool or admin script depends on this
  endpoint before removing.

## Session log

- _2026-05-07_ — Item created from the security review of the PR
  preview handoff fix. Endpoint flagged as live-unused (only
  cascade-tests reference it).
