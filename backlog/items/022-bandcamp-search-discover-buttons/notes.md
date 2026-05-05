# Notes

## Decisions

- _2026-05-05_ — Filed as a P2 follow-up to the existing Bandcamp
  injection work (items 001 / 002 / 003 / 016 / 018). The discover
  and search surfaces are the last common Bandcamp surfaces where the
  Play / Queue / Add-to-Fomo trio is missing.

## Open threads

- Artist / label card treatment is the design-level open question.
  Default = cart-toggle-only because bulk-enqueueing an artist's full
  discography on a single click is a footgun. Worth a 30-second user
  confirmation before implementation.
- Bandcamp's discover page has been revamped at least twice; the DOM
  templates are not stable. Capture both `discover/<tag>` and a
  search-results page into the project's `temp/` folder before
  starting, so the implementation has reference markup the way item
  020 used `temp/bandcamp-logged-in.html` /
  `bandcamp-logged-out.html`.
- Search results paginate via "page" params and infinite-scroll
  on some templates. Confirm the MutationObserver path
  (`reinjectSoon`) catches new-page entries without an extra polling
  loop.

## Session log

- _2026-05-05_ — Filed during item 013 review. User flagged the
  discover and search surfaces as the missing place for the trio.
