---
id: 054
title: CI for mobile (typecheck + lint + test + EAS smoke)
effort: M
created: 2026-05-07
---

# CI for mobile (typecheck + lint + test + EAS smoke)

## Why

Catch regressions before merge. Without CI, every later mobile PR is
graded by hand.

## What

- Add a CI job that runs on every PR touching `packages/mobile/`,
  `packages/shared/`, or shared root configs.
- Steps: install, typecheck, lint, run unit + component tests, run an
  EAS Build "preview" profile to confirm the iOS and Android binaries
  still compile.
- The EAS smoke build uses cached credentials — does not require
  human interaction.

## Acceptance criteria

- [ ] PR fails CI when typecheck or lint regresses.
- [ ] PR fails CI when EAS Build cannot produce a preview iOS or
      Android binary.
- [ ] Successful CI run takes < 15 minutes for the typical case.
- [ ] CI does not run on PRs that don't touch mobile-relevant paths
      (matrix path filters).

## Code pointers

- `.github/workflows/` — existing CI workflows for `back` / `front`.

## Out of scope

- Public release pipelines (TestFlight / Play) — task 106.
- Test coverage thresholds — set later once there's enough code to
  measure meaningfully.
