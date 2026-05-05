# Notes

Working notebook for this item.

## Decisions

- _2026-05-04_ — Safari excluded by design. Manual Xcode round-trip
  cannot be wrapped in a Node watcher and trying to do so will mislead
  whoever uses the script.

## Rejected approaches

- _(none yet)_

## Open threads

- Confirm whether `utils/webserver.js` already builds to disk; if yes,
  it might be enough to extend it with multi-browser support. If it
  serves from memory, we likely want a separate webpack-watch entry to
  avoid running an HTTP server for every target.
- Consider whether `--browsers all` should fan out to chrome+firefox
  only (Safari excluded) and document that explicitly so a future
  reader doesn't think Safari was forgotten.

## Session log

- _2026-05-04_ — Filed alongside item 018 while iterating on item 001.
