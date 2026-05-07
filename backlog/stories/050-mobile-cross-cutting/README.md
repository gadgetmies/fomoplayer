# Story 050 — Cross-cutting: offline, accessibility, telemetry, distribution

The non-feature work that has to ship before the apps go to public
stores: an offline-tolerant mutation queue, accessibility coverage,
telemetry / crash reporting, and the App Store + Play Store
distribution pipelines.

## User-facing change

- A user on a flaky connection (subway, plane) keeps swiping through
  cached lists, marking heard, adding to cart — the actions queue and
  replay when the connection returns. The UI never feels like it's
  "stuck waiting".
- VoiceOver and TalkBack users can drive the whole app; dynamic-type
  users get readable layouts at every text size; reduce-motion is
  respected.
- The team gets crash reports, key analytics events, and a crash-free
  rate baseline before any public store release.
- Internal testers get builds via TestFlight and Play Internal Testing
  on every merge to `master`.

## Why

These are cross-cutting concerns that touch every screen. Doing them
once at the end is risky (last-minute a11y bugs are common) and once
at the start is wasteful (no surfaces to apply them to). The right
shape is a dedicated story near the end of the epic that audits and
fills the gaps after the feature stories have landed.

## "Done" looks like

- Optimistic mutation queue with replay-on-reconnect for: heard,
  add-to-cart, remove-from-cart, follow, unfollow, ignore, un-ignore,
  star, mark-purchased.
- Accessibility audit complete with documented remediation: every
  interactive element has a label, hit targets ≥ 44 pt, dynamic-type
  scaling tested at largest size, reduce-motion respected for
  list-row animations and onboarding transitions.
- Sentry (or equivalent) wired with release tagging; crash-free rate
  visible on a dashboard; key analytics events instrumented (login,
  play, add-to-cart, follow, push-opt-in).
- TestFlight + Play Internal Testing pipelines via EAS Submit;
  signing keys and provisioning profiles set up; store metadata,
  screenshots, and privacy nutrition labels prepared.

## Tasks

- [103 — Offline mutation queue + replay-on-reconnect](../../tasks/103-mobile-offline-mutation-queue)
- [104 — Accessibility audit & remediation](../../tasks/104-mobile-accessibility-audit)
- [105 — Telemetry & crash reporting](../../tasks/105-mobile-telemetry-and-crash-reporting)
- [106 — TestFlight / Play Internal pipelines + store metadata](../../tasks/106-mobile-store-distribution)
