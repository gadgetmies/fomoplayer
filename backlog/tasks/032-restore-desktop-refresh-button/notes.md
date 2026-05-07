# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-06_ — Reuse `refreshTracks()` and the existing
  `updatingTracks` state rather than introducing a parallel button
  loading state. The pull-to-refresh path already handles
  in-flight, errors, and the spinner.

## Rejected approaches

- _YYYY-MM-DD_ — what was tried, why it didn't work.

## Open threads

- The right "non-touch" check. `(hover: hover) and (pointer: fine)`
  is the most-correct media query, but: hybrid devices (touch
  laptops) match both, and Safari has historically lied about
  pointer types. Erring toward "always show the button" is the
  cheaper failure mode.

## Session log

- _2026-05-06_ — Item created. No code changes yet. Removal commit
  is `78fda47d feat: replace refresh button with pull-to-refresh`;
  use it as the starting reference.
