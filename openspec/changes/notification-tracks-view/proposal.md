## Why

Users configure search notifications (artists, labels, free-text
queries) to be told when matching tracks land in their library — but
today the only way to see those matches is to wait for an email or
push notification to fire. There is no in-app surface that aggregates
the *unlistened* tracks matching the user's active notifications, so
the user cannot work through their watch list as a list: they can only
react to each notification as it arrives, and if notification delivery
is delayed, broken, or muted the matches are effectively invisible.

Adding a dedicated track list breaks that dependency. The watch list
becomes a place the user can visit, paginate, and work through with
the same playback / mark-heard plumbing as the existing `new`,
`recent`, and `heard` panels.

## What Changes

- Add a new backend helper `getNotificationTracks(userId, stores,
  limit, offset)` in `packages/back/routes/users/logic.js` that
  loads the user's active search notifications and runs **one
  combined SQL query** which OR-merges every notification's
  predicate group (entity-id filters, free-text full-text match,
  per-notification store scoping) into a single `WHERE` clause,
  applies `onlyNew: true` (unheard), orders by `track_added DESC`,
  and slices `offset` / `limit` server-side. No per-notification
  fan-out and no client-side composition.
- Expose `GET /api/me/tracks/notifications?offset=&limit=&store=` in
  `packages/back/routes/users/api.js`, honouring the same `offset`
  / `limit` / `store` query-param contract as the other tracklist
  endpoints.
- Extend the frontend tracklist plumbing in
  `packages/front/src/App.js` with a new `notifications` bucket on
  `defaultTracksData` and `trackOffsets`, and teach `updateTracks`,
  `hasMoreTracks`, and `loadMoreTracks` to fetch from the new
  endpoint when the active list is `notifications`. The frontend
  just calls the endpoint and renders the response — no
  per-notification iteration or merging on the client. Register the
  `/tracks/notifications` route.
- Add a "Notification tracks" entry to the Discover dropdown in
  `packages/front/src/TopBar.js`.
- Teach `packages/front/src/Player.js` to source the current-track
  context from the `notifications` bucket when that list is active,
  so next/previous navigation stays inside it.
- Marking a track heard from the notifications view removes it from
  the list on next refresh / pagination (the underlying
  `onlyNew: true` predicate already excludes heard tracks).

## Capabilities

### New Capabilities

- `notification-tracks-list`: A new tracklist surface that
  aggregates the unlistened tracks matching the user's active
  search notifications — covering what "active notification"
  means in this context, how matches are unioned and deduplicated,
  what the API contract is, and how the frontend bucket integrates
  with the existing list/pagination/player plumbing.

### Modified Capabilities

<!-- None — the existing `user-tracks-query` capability covers the
`new` / `recentlyAdded` / `heard` panels produced by the single
`queryUserTracks` SQL entry point. The notifications list does not
go through that path; it composes per-notification searches via
`onlyNew: true`, so it is a distinct capability rather than a delta
to user-tracks-query. -->

## Impact

- Backend: new helper in `packages/back/routes/users/logic.js`,
  new route in `packages/back/routes/users/api.js`, and a new
  predicate-group builder factored out of (or co-located with)
  the existing `searchForTracks` parsing so a single combined
  query can be assembled. No schema changes — reuses
  `user_search_notification` /
  `user_search_notification__store` and the existing track
  details / search machinery.
- Frontend: new bucket in `packages/front/src/App.js`
  (`defaultTracksData`, `trackOffsets`, `updateTracks`,
  `hasMoreTracks`, `loadMoreTracks`, route registration). New
  Discover-dropdown entry in `packages/front/src/TopBar.js`. New
  branch in `packages/front/src/Player.js` for current-track
  context.
- No extension changes. No new dependencies. No notification
  delivery changes (email / push behaviour is untouched).
- The reference PR (#155 / branch
  `feat/notification-tracks-view-18059594438716495487`) predates a
  large restructure on master — it is treated as a spec to
  re-implement against current master, not a patch to apply.
