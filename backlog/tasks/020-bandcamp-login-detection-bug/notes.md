# Notes

## Decisions

_(empty)_

## Rejected approaches

_(empty)_

## Open threads

- The user mentioned captures in the project's `temp/` folder; at filing
  time `temp/` was empty and the `logged-in.html` / `logged-out.html`
  files in `packages/browser-extension/` contain Beatport markup, not
  Bandcamp. Need the actual captures before implementation.

## Session log

### 2026-05-05

- Filed from a user-reported bug: Bandcamp sync buttons in the popup
  always disabled. Traced to `probeLoggedIn` using `.userpic` as the
  signal, which is unreliable on modern Bandcamp pages.
