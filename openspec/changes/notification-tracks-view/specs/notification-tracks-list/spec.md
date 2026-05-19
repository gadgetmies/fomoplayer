## ADDED Requirements

### Requirement: Notification-tracks endpoint returns the deduplicated union of unlistened matches for the user's active notifications

`GET /api/me/tracks/notifications` SHALL return tracks that
**(a)** match at least one of the requesting user's active search
notifications, **(b)** have not yet been heard by the requesting
user, and **(c)** belong to a store the matching notification is
subscribed to. The response SHALL deduplicate by `track_id` — a
track matching multiple notifications appears exactly once — and
SHALL order the result by `track_added DESC` (most-recently-added
first).

An "active notification" is any row that
`GET /api/me/notifications` returns for the user; no additional
delivery-channel gating is applied at this surface.

#### Scenario: Track matching one notification appears in the list

- **GIVEN** the user has one active notification `artist:1234` on
  the `Beatport` store
- **AND** a Beatport track exists whose `track__artist` row links
  it to `artist_id = 1234`, the user has not heard it, and it is
  in the user's library scope
- **WHEN** the user requests `GET /api/me/tracks/notifications`
- **THEN** the response's `tracks` array contains that track row

#### Scenario: Track matching multiple notifications appears once

- **GIVEN** the user has two active notifications whose match
  sets both include the same track
- **WHEN** the user requests `GET /api/me/tracks/notifications`
- **THEN** the response's `tracks` array contains that track
  exactly once

#### Scenario: Already-heard track is excluded

- **GIVEN** a track would match the user's notifications but the
  user already has a `user__track` row with `user__track_heard`
  set for it
- **WHEN** the user requests `GET /api/me/tracks/notifications`
- **THEN** that track is **not** in the response

#### Scenario: Cross-store match is filtered to the notification's stores

- **GIVEN** the user's notification `label:42` is subscribed only
  on `Bandcamp`
- **AND** a Beatport track exists with `label_id = 42`
- **WHEN** the user requests `GET /api/me/tracks/notifications`
- **THEN** the Beatport track is **not** in the response (the
  notification's store subscription scopes its matches)

#### Scenario: Tracks are ordered most-recently-added first

- **GIVEN** two tracks match the user's notifications with
  `track_added` values one day apart
- **WHEN** the user requests `GET /api/me/tracks/notifications`
- **THEN** the track with the later `track_added` precedes the
  earlier one in the `tracks` array

### Requirement: Notification-tracks endpoint honours `offset` / `limit` / `store` query params

`GET /api/me/tracks/notifications` SHALL accept `offset`, `limit`,
and `store` query parameters. `limit` clamps the returned
`tracks` array length; `offset` advances over the same
`track_added DESC` ordering used for the unsliced union; `store`
(an array of store-name strings, lowercased) restricts the
response to tracks from the named stores AND restricts which
notifications contribute to the predicate (a notification with no
subscription on any of the requested stores SHALL NOT contribute
matches). The response SHALL include a `pagination` object with
`offset`, `count` (the actual returned length), and `total` (the
size of the deduplicated union for the request's filters).

The endpoint SHALL resolve the unioned, deduplicated, paginated
match set on the backend; the frontend SHALL NOT iterate
notifications or merge per-notification results client-side.
`offset` / `limit` / ordering / deduplication / `total` are all
computed server-side.

#### Scenario: Successive pages return disjoint slices in the same order

- **GIVEN** the user's deduplicated notification-match union has
  ≥ 40 tracks
- **WHEN** the client requests `?offset=0&limit=20` and then
  `?offset=20&limit=20`
- **THEN** the two responses' `tracks` arrays are disjoint
- **AND** concatenating them yields the first 40 tracks of the
  union in `track_added DESC` order

#### Scenario: `store` filter restricts results AND drops off-store notifications

- **GIVEN** the user has notifications `artist:1` (Beatport only)
  and `artist:2` (Bandcamp only)
- **WHEN** the client requests `?store=bandcamp`
- **THEN** the `tracks` array contains only Bandcamp tracks
- **AND** none of the matches for `artist:1` are present
- **AND** the `artist:1` notification SHALL NOT contribute to the
  predicate evaluated by the database (it cannot contribute under
  the store filter)

#### Scenario: Pagination reports offset, count, and total

- **WHEN** any call returns N tracks at offset O
- **THEN** the response's `pagination.offset` equals O,
  `pagination.count` equals N, and `pagination.total` equals the
  size of the deduplicated union as computed for that request

### Requirement: Notification-tracks endpoint resolves the match set in a single combined query

The backend SHALL resolve the unioned, deduplicated, ordered, and
paginated notification-match set in a single combined database
query whose `WHERE` clause OR-merges one predicate group per
contributing notification. The implementation MUST NOT issue one
search per notification and union the results in application code,
and the frontend MUST NOT issue one request per notification and
union the results client-side.

A companion `COUNT(DISTINCT track_id)` query against the same
predicate set (for `pagination.total`) is permitted; it MAY be
expressed as a second statement in the same transaction or as a
sibling `SELECT` inside a shared CTE — either way, the per-page
result and the total observe a consistent snapshot.

#### Scenario: Single page request hits the database once for the slice

- **WHEN** the user requests
  `GET /api/me/tracks/notifications?offset=0&limit=20`
- **THEN** the backend issues exactly one query to retrieve the
  paginated tracks (plus at most one companion count query for
  `pagination.total`)
- **AND** the backend does NOT issue one `searchForTracks` (or
  equivalent) call per notification

#### Scenario: Frontend issues one request per page

- **WHEN** the frontend loads or paginates the notifications
  bucket
- **THEN** it issues exactly one HTTP request to
  `GET /api/me/tracks/notifications` per page
- **AND** it does NOT iterate the user's notifications, fan out
  per-notification requests, or merge per-notification results
  client-side

### Requirement: User with no active notifications gets an empty list

`GET /api/me/tracks/notifications` SHALL return
`{ "tracks": [], "pagination": { "offset": 0, "count": 0, "total": 0 } }`
when the user has no active search notifications. It SHALL NOT
return an error.

#### Scenario: Fresh user with no notifications

- **GIVEN** the requesting user has no rows in
  `user_search_notification`
- **WHEN** the user requests `GET /api/me/tracks/notifications`
- **THEN** the response is
  `{ "tracks": [], "pagination": { "offset": 0, "count": 0, "total": 0 } }`
  with HTTP 200

### Requirement: Frontend renders the notifications bucket as a first-class tracklist

The frontend SHALL surface the notifications endpoint as a
dedicated tracklist with the same affordances as the existing
`new` / `recent` / `heard` lists: a route, a Discover-dropdown
entry, infinite-scroll pagination via the shared
`hasMoreTracks` / `loadMoreTracks` plumbing, and current-track
navigation scoped to the bucket.

#### Scenario: Visiting `/tracks/notifications` shows the list

- **WHEN** the user navigates to `/tracks/notifications`
- **THEN** the application sets `listState = 'notifications'`,
  fetches the first page from
  `GET /api/me/tracks/notifications`, and renders the returned
  tracks in the standard tracklist view

#### Scenario: Discover dropdown exposes the link

- **WHEN** the user opens the Discover dropdown in the top bar
- **THEN** a "Notification tracks" entry is visible alongside
  "New tracks", "Recently added", and "Recently played"
- **AND** clicking it navigates to `/tracks/notifications` and
  closes the dropdown

#### Scenario: Infinite scroll paginates the notifications list

- **GIVEN** the user is on `/tracks/notifications` with a partial
  page rendered (fewer entries than the union total)
- **WHEN** the user scrolls past the load-more threshold
- **THEN** `loadMoreTracks` fetches the next page from
  `GET /api/me/tracks/notifications?offset=<next>&limit=<...>` and
  appends the deduplicated rows to the existing bucket
- **AND** when no more rows remain, `hasMoreTracks` returns
  `false` and the bottom-of-list "no more" indicator shows

#### Scenario: Player next/previous stays inside the notifications bucket

- **GIVEN** `listState === 'notifications'` and a track from the
  notifications bucket is currently playing
- **WHEN** the player advances via next or previous
- **THEN** the new current track is selected from the
  `notifications` bucket (not `new`, `recentlyAdded`, `heard`,
  `selectedCart.tracks`, or `searchResults`)

#### Scenario: Marking a track heard removes it on next refresh

- **GIVEN** the user is on `/tracks/notifications` and marks a
  visible track as heard (via play or explicit action)
- **WHEN** the next `updateTracks` or `loadMoreTracks` call
  completes
- **THEN** the heard track no longer appears in the returned
  `tracks` array (because the combined query's `onlyNew: true`
  predicate excludes tracks with `user__track_heard IS NOT NULL`)
