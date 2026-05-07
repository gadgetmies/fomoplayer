# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-07_ — Logged as separate task instead of opening a fix PR
  directly, because the failure mode in PR preview vs other environments
  isn't yet pinned down. The first session should reproduce on local /
  staging / production before changing code.
- _2026-05-07_ — **Dropped (wontfix for now).** Root cause identified:
  `resolveStoresForRequest` in
  `packages/front/src/request-json-with-credentials.js:5` derives the
  store list from `hostname.split('.').slice(0, -2)` when
  `isPreviewEnv` is false. PR preview hosts like
  `fomoplayer-previewbase-<…>.up.railway.app` produce
  `['fomoplayer-previewbase', 'up']` — non-existent store slugs that
  the per-store fan-out then dispatches to. So requests are firing,
  but against `?store=fomoplayer-previewbase&store=up`, which the
  backend treats as "no real stores" and returns no results — making
  it *look* like nothing fired in the user-visible UI.
  The proper fix is to make `isPreviewEnv` actually true on PR preview
  builds (or stop deriving stores from the host entirely on those
  builds). Parking until we decide the right shape — likely combined
  with a broader review of how preview environments are detected.

## Rejected approaches

-

## Open threads

- Decide the long-term shape: keep deriving from hostname for
  multi-tenant store-domain deploys, but ensure preview detection
  short-circuits it; or drop hostname-derived stores entirely and
  always require an explicit `?store=` (or a default).

## Session log

- _2026-05-07_ — Filed.
- _2026-05-07_ — Root cause found (subdomain-derived `?store=` values
  are garbage on Railway preview hosts). Marked wontfix and moved to
  `dropped/`.
