---
id: 034
title: Notification tracks view (unlistened tracks matching active notifications)
effort: M
created: 2026-05-06
---

# Notification tracks view (unlistened tracks matching active notifications)

## Why

Users have configured search notifications (artists, labels, free-text
queries) but currently can only see new matches when an email or push
notification fires. There's no in-app view that aggregates the
*unlistened* tracks matching their active notifications. Adding one
gives them a single place to work through everything their watch list
has flagged, without depending on notification delivery.

## What

Add a new track list — `notifications` — that lists tracks matching
the user's active search notifications which the user has not yet
heard. It plugs into the existing tracklist plumbing (paging,
loading-more, current-track tracking) so it behaves like `new` /
`recent` / `heard`.

### Backend

- Add `getNotificationTracks` in
  `packages/back/routes/users/logic.js`. Iterates the user's active
  search notifications and runs each search with `onlyNew: true`,
  returning the union (deduped) of unlistened matches.
- Expose it as `GET /api/me/tracks/notifications` in
  `packages/back/routes/users/api.js`. Honour the same `offset` /
  `limit` / `store` query params the other tracklist endpoints
  accept.

### Frontend

- `packages/front/src/App.js` — extend `defaultTracksData` and
  `trackOffsets` with a `notifications` (or `notification`) bucket;
  teach `updateTracks`, `hasMoreTracks`, and `loadMoreTracks` to
  fetch from the new endpoint when `listState === 'notifications'`.
  Register the `/tracks/notifications` route.
- `packages/front/src/TopBar.js` — add a "Notification tracks"
  entry to the existing Discover dropdown.
- `packages/front/src/Player.js` — when the active list is
  `notifications`, source the current-track context from that
  bucket so next/previous navigation works.

## Acceptance criteria

- [ ] `GET /api/me/tracks/notifications?offset=&limit=&store=` returns
      paged unlistened tracks from the union of the user's active
      notification searches; respects `store` filtering.
- [ ] Visiting `/tracks/notifications` in the app shows the list,
      paginates as the user scrolls (same pattern as
      `/tracks/new`), and the bottom-of-list "loading more" /
      "no more" indicator works.
- [ ] The Discover dropdown gains a "Notification tracks" link that
      navigates to the new view.
- [ ] Playing a track from the notifications list, then advancing
      with next / previous, stays inside the notifications bucket
      (not the new/recent/heard bucket).
- [ ] Marking a track heard removes it from the notifications view
      (next refresh / pagination).
- [ ] No regression to existing `new` / `recent` / `heard` lists.

## Code pointers

- `packages/back/routes/users/logic.js` — add `getNotificationTracks`
  here. Look at how other list logic (e.g. recent / heard) composes
  the per-store search; the implementation should iterate the
  user's notifications and OR-merge their match sets with
  `onlyNew: true`.
- `packages/back/routes/users/db.js:1098` — existing notification
  schema (`user_search_notification`, `user_search_notification__store`).
  Reuse the row shape that already powers GET `/notifications`
  (`packages/back/routes/users/api.js:399`).
- `packages/back/routes/users/api.js:141` — the existing track
  endpoints under `/tracks/...` are next to here; mount
  `/tracks/notifications` alongside.
- `packages/front/src/App.js:45` — `defaultTracksData` shape; add
  the new bucket here.
- `packages/front/src/App.js:136` — `trackOffsets` initial state;
  add the bucket here too.
- `packages/front/src/App.js:149,163,456` — `hasMoreTracks`,
  `loadMoreTracks`, `updateTracks` are the pagination plumbing to
  extend.
- `packages/front/src/TopBar.js:173` — Discover dropdown; add the
  new link inside it.
- Reference branch: `feat/notification-tracks-view-18059594438716495487`
  and PR
  [#155](https://github.com/gadgetmies/fomoplayer/pull/155).
  The PR predates a large restructure on master (test-lib /
  api-key / cli / chrome-extension deletions, chrome→browser
  rename) so it cannot be rebased mechanically — treat it as a
  spec to re-implement against current master, not a patch to
  apply.

## Out of scope

- Reordering or scoring the notification matches differently from
  other lists.
- Per-notification filtering inside the view (e.g. "only show
  matches for this artist"). The view shows the union across all
  active notifications.
- Auto-marking matches as "seen" when the user opens the view.
- Notification delivery (email / push) changes.

## Open questions

- What counts as "active"? All non-deleted notifications, or only
  ones with a delivery channel enabled? Match what the existing
  `/notifications` endpoint considers active.
- How to source-name the bucket — `notifications` (PR's choice) or
  `notification` to match the existing singular naming on
  `recent`/`heard`/`new`. PR uses `notifications`; either is
  fine, just be consistent with whichever route name is picked.
- Should the count of unlistened-notification-matches surface in
  the TopBar (badge), or is the link enough for the first cut?
  Defer the badge — separate item if wanted.
