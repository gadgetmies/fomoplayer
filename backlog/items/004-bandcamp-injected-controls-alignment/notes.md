# Notes

## Decisions

_(empty)_

## Rejected approaches

_(empty)_

## Open threads

_(empty)_

## Session log

- 2026-05-05: In
  `packages/browser-extension/src/js/content/bandcamp/inject.js`, dropped
  the `margin-left: 8px` shim from `buttonContainer()` and switched the
  per-row mount in `injectReleaseLevelButtons` to
  `timeSpan.insertAdjacentElement('afterend', wrap)`, falling back to
  `trackTitleCell.appendChild(wrap)` only when the row has no `.time`
  span. Build (`yarn build:chrome`) passes; live UI verification still
  owed.
