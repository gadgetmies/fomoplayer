## 1. Backend — single-query predicate builder

- [x] 1.1 In a new module (e.g.
      `packages/back/routes/shared/db/notification-predicate.js`)
      or co-located with
      `packages/back/routes/shared/db/search.js`, add a pure
      function `parseNotificationText(text)` that extracts
      `{ artistIds: number[], labelIds: number[], freeText:
      string }` from a notification string using the same
      `(\S+:\S+)+?` regex `searchForTracks` uses. Cover
      `artist:NNN`, `label:NNN`, free-text, and composite
      (`artist:NNN concussion`) shapes.
- [x] 1.2 Add `buildNotificationPredicate(parsed,
      subscribedStoreIds)` returning an `sql` fragment (a single
      parenthesised expression) suitable for OR-merging into a
      larger `WHERE` clause. The fragment combines:
      - `EXISTS (… track__artist … artist_id IN (parsed.artistIds))`
        for each artist id (AND-ed),
      - analogous for labels,
      - the FTS predicate against the per-track composite text
        when `freeText` is non-empty (matching the existing
        `searchForTracks` composite source),
      - `EXISTS (… store__track … store_id = ANY(subscribedStoreIds))`
        to scope to the notification's subscribed stores.

## 2. Backend — `getNotificationTracks` helper

- [x] 2.1 In `packages/back/routes/users/logic.js`, add an exported
      `getNotificationTracks(userId, stores, limit, offset)` that:
      (a) calls `queryNotifications(userId, stores)` to fetch the
      user's active notifications and groups rows by notification
      id (one entry per notification with the merged subscribed
      store id set),
      (b) drops any notification whose subscribed-store set does
      not intersect the requested `stores` filter,
      (c) for each remaining notification, parses its text and
      builds a predicate fragment via the helpers from §1,
      (d) assembles ONE combined SQL query against
      `track_details` (joined with `user__track`, `cart`, and the
      store join used elsewhere) whose `WHERE` clause is
      `user__track_heard IS NULL AND <request-store filter> AND
      (predicate_1 OR predicate_2 OR …)`, ordered by
      `track_added DESC`, sliced via `LIMIT $limit OFFSET $offset`,
      and
      (e) returns
      `{ tracks: <rows>, pagination: { offset, count: rows.length,
      total: <COUNT(DISTINCT track_id) over the same predicate> } }`.
- [x] 2.2 The page query and the `COUNT(DISTINCT track_id)` query
      MUST observe the same snapshot — either share a CTE in one
      `WITH … SELECT` or run inside a single transaction.
- [x] 2.3 If `queryNotifications` returns no rows after the
      request-store filter, short-circuit and return
      `{ tracks: [], pagination: { offset, count: 0, total: 0 } }`
      without issuing the combined query.
- [x] 2.4 The combined query MUST be issued exactly once per page
      request — no per-notification database round trip. The test
      suite SHALL include an explicit assertion (e.g. via a
      query-count helper or by `pg.queryRowsAsync` spy) that the
      page handler issues at most two DB statements: the slice
      query and the count query (or one CTE that produces both).
- [x] 2.5 Decide free-text composite-text strategy at
      implementation time: prefer reusing whatever per-track
      composite source the existing `searchForTracks` already
      builds (so notifications and the search bar match
      identically). If a refactor is needed to make that shared,
      do it here and adjust `searchForTracks` to use the same
      helper.

## 3. Backend — HTTP route

- [x] 3.1 In `packages/back/routes/users/api.js`, mount
      `GET /tracks/notifications` next to the existing
      `GET /tracks` handler. Read `offset` / `limit` / `store` from
      the query string, normalising `store` to a lowercased string
      array (and `null` when not provided), the same way `GET
      /tracks` does.
- [x] 3.2 Parse `offset` / `limit` as non-negative integers with
      sensible defaults (`offset=0`, `limit=20`). Reject negative
      or non-numeric values with HTTP 400.
- [x] 3.3 Wire the handler to call `getNotificationTracks` and send
      its return value as JSON.
- [x] 3.4 Verify the route is exposed at
      `GET /api/me/tracks/notifications` via the existing
      `/me/...` mount point.

## 4. Backend — tests

- [x] 4.1 Add a test file under
      `packages/back/test/tests/users/tracks/` covering the
      requirements: user with no notifications gets an empty
      response; one matching track surfaces; dedup across two
      notifications matching the same track; heard tracks are
      excluded; `store` filter excludes off-store notifications;
      pagination yields disjoint successive pages in
      `track_added DESC` order; `pagination.total` equals the
      union size; AND the page handler issues at most one slice
      query plus one count query (no per-notification round
      trips) — see §2.4.
- [x] 4.2 Use the application's existing test helpers
      (`addStoreTracksToUsers`, `setupBeatportTracks`, etc.) for
      fixture state; do not insert via raw SQL.
- [x] 4.3 Cover all three notification text shapes — `artist:NNN`,
      `label:NNN`, free-text — and at least one composite
      (`artist:NNN concussion`).

## 5. Frontend — App.js state and fetching

- [x] 5.1 In `packages/front/src/App.js`, extend
      `defaultTracksData` with a `notifications: []` bucket under
      `tracks`. Extend the `trackOffsets` initial state with
      `notifications: 0`.
- [x] 5.2 In `updateTracks(append)`, branch on
      `listState === 'notifications'`: build a query string with
      `offset` / `limit` / `store` (no `_new` / `_recent` /
      `_heard` suffixes), issue **exactly one**
      `requestJSONwithCredentials({ path:
      '/me/tracks/notifications…' })` call, and update
      `tracksData.tracks.notifications`,
      `trackOffsets.notifications`, and a
      `pagination.notifications` field with the response's
      `pagination` object. On `append=true`, deduplicate appended
      rows by id (`deduplicateTracks`). The branch SHALL NOT read
      the user's notifications list, fan out per-notification
      requests, or merge per-notification responses on the client.
- [x] 5.3 In `hasMoreTracks`, return
      `pagination.notifications && pagination.notifications.offset
      + pagination.notifications.count <
      pagination.notifications.total` for the notifications list
      state. In `loadMoreTracks`, route `'notifications'` to the
      same `updateTracks(true)` path the other tracklists use.
- [x] 5.4 Register the `/tracks/notifications` route so
      `syncStateWithLocation` sets `listState = 'notifications'`
      when the path is hit (it already derives the state from the
      second path segment — confirm no extra mapping is needed).

## 6. Frontend — TopBar

- [x] 6.1 In `packages/front/src/TopBar.js`, inside the
      Discover dropdown, add a new `NavLink` to
      `/tracks/notifications` with label "Notification tracks",
      matching the pattern of the existing
      "New tracks" / "Recently added" / "Recently played" links
      (including the `setState({ discoverMenuOpen: false })`
      onClick).
- [x] 6.2 Extend the `selected` predicate on the Discover
      `MenuNavButton` to include `'notifications'` so the menu
      highlights as active when the user is on the notifications
      list.

## 7. Frontend — Player

- [x] 7.1 In `packages/front/src/Player.js`'s `getTracks()`, add a
      branch for `listState === 'notifications'` that sources
      tracks from `this.props.tracks.notifications`.

## 8. Wire-through plumbing

- [x] 8.1 Audit `applyCartMutation` / `patchTrackCartMembership` in
      `App.js`: add the `notifications` bucket to the slice set so
      cart-membership updates patch into it (same as `new` /
      `heard` / `recentlyAdded`).
- [x] 8.2 If `markHeard` or other per-listState branches in
      `App.js` need to handle `'notifications'` to match the
      `'new'` semantics (no special-casing for `'heard'`),
      extend them. The default (no-op when on `'heard'`) is what
      we want for `'notifications'`.

## 9. Verification

- [ ] 9.1 Run the backend test suite for the new tests.
- [ ] 9.2 Run the frontend type-check / lint / unit-test suites.
- [ ] 9.3 Build the frontend bundle without errors.
- [ ] 9.4 Manual smoke (per CLAUDE.md "UI feature correctness"
      rule): start the dev server, navigate to
      `/tracks/notifications` with a logged-in test user that has
      at least one active notification, confirm the list renders,
      paginates as the user scrolls, that next/previous navigation
      stays inside the bucket, that the Discover-dropdown link is
      present and highlights when active, and that
      `/tracks/new` / `/recent` / `/heard` still work unchanged.
      In the network panel, confirm each page is exactly one
      request to `/me/tracks/notifications`.
