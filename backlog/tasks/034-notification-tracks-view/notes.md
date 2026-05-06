# Notes

Working notebook for this item. Date entries so future sessions can skim.

## Decisions

- _2026-05-06_ — Treat PR #155 / branch
  `feat/notification-tracks-view-…` as a **spec** to re-implement
  against current master, not a patch to rebase. The branch
  conflicts with ~25 files because master has since deleted the
  whole CLI tree, several auth-handoff modules, the legacy
  `chrome-extension/` package (renamed to `browser-extension/`),
  and many test-lib files; resolving each "modify/delete" by hand
  would either drop intentional master deletions or drop the
  feature work. The actual feature surface is small (one backend
  helper, one route, four frontend touch-points), so the cheaper
  path is to re-write it on top of current master.

## Rejected approaches

- _2026-05-06_ — Mechanically rebasing
  `feat/notification-tracks-view-…` on master and resolving
  conflicts file-by-file. The branch predates a major restructure
  and almost every conflict is a "modify/delete" that needs a
  human judgment call about which side to honour. Aborted.

## Open threads

- Decide bucket key naming (`notifications` vs `notification`) at
  implementation time. PR uses plural; pick whichever lines up
  with the surrounding code's idiom in current master.
- Confirm `getNotificationTracks` should perform N searches in
  parallel or stream them; depends on how heavy a single search
  is and how many notifications a typical user has.

## Session log

- _2026-05-06_ — Item created from PR #155 / branch
  `feat/notification-tracks-view-18059594438716495487`. PR was
  authored against an older master, pre-restructure. Verified
  current master still has `App.js` `defaultTracksData` (line 45),
  `trackOffsets` (line 136), `updateTracks` (line 456),
  `hasMoreTracks` / `loadMoreTracks`, `TopBar.js` Discover
  dropdown (line 173), `users/logic.js`, and `users/api.js`
  tracklist routes — so the original integration points all
  still exist.
