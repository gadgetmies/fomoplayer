---
id: 105
title: Telemetry & crash reporting
effort: M
created: 2026-05-07
---

# Telemetry & crash reporting

## Why

Without crash reports and a few load-bearing analytics events,
the team is flying blind on regressions and feature usage. Set
the baseline before public release.

## What

- Sentry (or equivalent) wired with release tagging from EAS
  build versions.
- Source maps uploaded automatically per build.
- Crash-free rate dashboard.
- Key analytics events: login, play, add-to-cart, follow,
  push opt-in / opt-out.
- Privacy: respect platform tracking-transparency on iOS;
  document what's collected; default to anonymous IDs.

## Acceptance criteria

- [ ] A crash in dev surfaces in Sentry with a usable stack
      trace.
- [ ] Each key event fires once per occurrence with the right
      properties.
- [ ] Release tagging tracks crashes back to a specific build.

## Code pointers

- `packages/back/routes/log/` — backend logging conventions to
  match.
