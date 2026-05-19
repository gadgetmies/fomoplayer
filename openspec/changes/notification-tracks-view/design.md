## Context

The user-tracks API today serves four "buckets" — `new`, `recent`,
`heard`, and `carts`. Each is a slice of the user's own library
ranked by some criterion (`queryUserTracks` for the first three via a
single SQL `WITH` query; `/carts/:id` for cart contents). Search
notifications (`user_search_notification` ⋈
`user_search_notification__store`) are configured against the same
search syntax that powers the global search box
(`artist:NNN`, `label:NNN`, free-text, etc.), but they have so far
been a **write-only** surface from the user's perspective: matches
become visible only via the `updateNotifications` cron job in
`packages/back/jobs/notifications.js`, which sends an email per
notification when `searchForTracks(text, { userId, addedSince,
storeIds, limit: 50 })` returns anything new since the
notification's last update timestamp.

So the existing machinery already iterates notifications and runs
`searchForTracks` per text — but only for the email job, where
per-notification result sets are the natural unit (each email is
about one notification). What's missing for an in-app tracklist is
a path that produces the *unioned, deduplicated, paginated* match
set across all of a user's notifications in one shot, so the
frontend can render it as a single bucket without iterating
notifications or merging results client-side.

This change adds that surface end-to-end: one new backend helper
that issues **one combined SQL query** OR-merging every
notification's predicate group, one new route, one new frontend
bucket that just calls the endpoint and renders the response, one
new dropdown link, and a small `Player.js` branch so next/previous
navigation stays within the bucket.

## Goals / Non-Goals

**Goals:**

- Give the user a single in-app place to work through every
  unlistened track matching any of their active search notifications.
- Resolve the unioned, deduplicated, paginated match set in **one
  combined SQL query** server-side — no per-notification fan-out
  in app code, no client-side composition.
- Reuse the existing `searchForTracks` *predicate-building* logic
  so this surface and the global search bar share the same
  "what matches a search expression" semantics (entity-id
  filtering, websearch FTS, store scoping).
- Plug into the existing tracklist plumbing (`updateTracks`,
  `hasMoreTracks`, `loadMoreTracks`, `Player.getTracks`) so the new
  bucket behaves like `new` / `recent` / `heard` for the user.
- Honour the same `offset` / `limit` / `store` query-param contract
  as the other tracklist endpoints.

**Non-Goals:**

- Per-notification filtering inside the view (e.g. "only matches for
  this artist"). The view is a union; per-notification slices stay
  in the `/settings/notifications` page.
- Reordering or scoring matches differently from other lists.
- Auto-marking matches as "seen" on view-open.
- Changes to email / push notification delivery.
- A TopBar badge with the unlistened-notification count (defer; a
  separate item if wanted).
- A materialised view or precomputed table of "notification matches
  per user" (see Decisions — explicitly rejected).

## Decisions

### D1. One combined SQL query OR-merging every notification's predicate group

**Decision.** `getNotificationTracks(userId, stores, limit, offset)`
loads the user's active notifications (with each notification's
subscribed store set), parses each notification's text into its
structured components (entity-id filters, free-text tokens) the
same way `searchForTracks` does today, builds a SQL predicate
group per notification, OR-merges those groups into the `WHERE`
clause of a single query against the existing `track` /
`track_details` join, and applies `onlyNew: true`, the request's
`store` filter, `ORDER BY track_added DESC`, and `LIMIT/OFFSET`
server-side. The helper performs **one** round trip to the
database.

Shape of the combined query (illustrative):

```sql
WITH logged_user AS (SELECT $userId::INT AS meta_account_user_id)
SELECT track_id AS id, td.*, user__track_heard AS heard, …
FROM track_details
  JOIN JSON_TO_RECORD(track_details) AS td (…) USING (track_id)
  NATURAL LEFT JOIN (user__track NATURAL JOIN logged_user)
  LEFT JOIN (… user_track_carts …) USING (track_id)
WHERE user__track_heard IS NULL                       -- onlyNew
  AND ($requestStores::TEXT IS NULL
       OR EXISTS (SELECT 1 FROM store__track
                  NATURAL JOIN store
                  WHERE store__track.track_id = track_details.track_id
                    AND LOWER(store_name) = ANY($requestStores)))
  AND (
        -- one disjunct per notification
        ( <predicate group for notification 1>
          AND EXISTS (… stores ∈ $stores_n1 …) )
     OR ( <predicate group for notification 2>
          AND EXISTS (… stores ∈ $stores_n2 …) )
     OR …
      )
ORDER BY track_added DESC
LIMIT $limit OFFSET $offset
```

A separate `SELECT COUNT(DISTINCT track_id)` against the same
predicate yields `pagination.total`. Both queries can be wrapped
in one transaction so they observe the same snapshot.

**How predicate groups are built.** Notification text is parsed
in JS using the same field-filter regex `searchForTracks` uses
(`(\S+:\S+)+?`), producing structured `{ artistIds, labelIds,
freeText }` per notification. Each becomes a SQL fragment:

- `artist:NNN` → `EXISTS (SELECT 1 FROM track__artist t WHERE
  t.track_id = track_details.track_id AND t.artist_id = NNN)`
- `label:NNN` → analogous against `track__label`
- free-text → `TO_TSVECTOR('simple', unaccent(<title || artist
  names || release name || label name>)) @@
  websearch_to_tsquery('simple', unaccent($text))` materialised
  via the same composite-text source the existing search uses
- composite (e.g. `artist:NNN concussion`) → AND of the above

The builder is factored into a small helper
(`buildNotificationPredicate(notification, tx)`) that returns an
`sql` fragment, so it can be reused if other surfaces ever need
the same "match notification" predicate without re-parsing.

**Why.**

- The user has explicitly asked for a single-query backend with no
  fan-out and no client-side composition — that constraint is
  load-bearing.
- A single query lets the planner pick its own join order across
  all notifications and apply `LIMIT/OFFSET` after the union
  rather than over-fetching N per-notification result sets, which
  is what fan-out forces.
- Pagination, ordering, and `total` semantics are trivially
  deterministic when they live entirely in SQL — no
  "merge-then-slice" gymnastics where partial per-notification
  caps could lower-bound the total.

**Alternatives considered.**

- *Per-notification fan-out in app code* (call `searchForTracks`
  per notification with `BPromise.map`, then union/sort/slice).
  Rejected per user direction; also forces the over-fetch
  pattern and a lower-bound-only `total`.
- *Materialised view of "notification matches per user".* Wrong
  freshness model: notifications are user-defined and changing,
  matches should reflect what the user has set right now, and
  the view would need invalidation on every notification update
  and every new-track ingest. Reconsider only if the combined
  query becomes a hotspot.

**Performance shape.** Postgres handles wide `OR` chains well as
long as each disjunct is independently selective. The
per-notification `EXISTS` predicates are index-backed
(`track__artist (artist_id)`, `track__label (label_id)`,
`store__track (track_id, store_id)`); free-text predicates use
the same FTS path the search bar already uses. The combined
query touches each candidate track row at most once. Worst case
is many free-text notifications with low selectivity; if
profiling shows it, we can switch to `UNION ALL` per disjunct
and dedup outside, but the OR form is the simpler default.

### D2. Single-list response shape, not the multi-bucket shape of `/me/tracks`

**Decision.** `GET /api/me/tracks/notifications` returns

```json
{
  "tracks": [ /* track rows, sorted track_added DESC */ ],
  "pagination": { "offset": 0, "count": 20, "total": 137 }
}
```

— a single flat list with a single pagination object, **not** the
nested `{ tracks: { new, heard, recentlyAdded }, meta, pagination:
{ new, recent, heard } }` shape of `/me/tracks`.

**Why.**

- The endpoint serves one bucket; the multi-bucket shape exists
  only because `queryUserTracks` returns three slices from one SQL
  query. There is no benefit in carrying the wrapper through.
- It mirrors the existing `searchForTracks` HTTP endpoint's array
  return, which the frontend already consumes for the `search`
  bucket — the front-end plumbing for handling a flat list is in
  place.

**Frontend implication.** The frontend's `tracksData.tracks` object
gains a `notifications` array sibling to `new` / `heard` /
`recentlyAdded`. `updateTracks` branches on `listState ===
'notifications'`: it requests the new endpoint, replaces (or
appends, when `append=true`) the `notifications` array, and updates
`trackOffsets.notifications` and a separate
`notificationsPagination` field (or extends the existing
`pagination` to include `notifications`).

### D3. Bucket name is `notifications` (plural) — frontend, route, and response key

**Decision.** Use `notifications` (matching the PR reference) for:
the route `/tracks/notifications`, the API path
`/api/me/tracks/notifications`, the `defaultTracksData.tracks`
bucket name, the `trackOffsets` key, and the `listState` value.

**Why.** The PR uses plural and so does the underlying entity
(`/me/notifications`); the existing singular names (`new`,
`recent`, `heard`) describe a *track's status*, not a feature, so
the analogy isn't strong either way. Pick one and stay consistent;
plural is what the surrounding notification UI already uses.

### D4. "Active notification" = anything `queryNotifications` returns

**Decision.** Iterate every row returned by `queryNotifications`
(joined `user_search_notification__store`). No additional
"delivery enabled" gating — matching the open question in the task
brief.

**Why.** That's what the existing `/notifications` UI surfaces as
the user's active notifications. Surfacing a track for a
notification the UI shows as active matches the user's mental
model. If delivery-channel gating becomes a thing later, it can be
applied here too without changing the contract.

### D5. `store` query param intersects with per-notification subscribed stores

**Decision.** When the request specifies `store=bandcamp`, the
combined query applies two store constraints simultaneously:

1. A top-level `EXISTS` clause restricting the track row to the
   requested stores (so cross-store matches for any notification
   are filtered out).
2. A per-disjunct store filter inside each notification's
   predicate group (`EXISTS (… store ∈ notification's
   subscribed stores …)`), so a notification subscribed only to
   Beatport contributes nothing under a Bandcamp-filtered
   request.

Notifications whose subscribed-store set has no intersection
with the requested stores are dropped from the OR'd predicate
list **before** assembling SQL — they cannot contribute any
matches, so emitting their disjunct just bloats the query plan.

**Why.** The user's filter is a hard "show me only Bandcamp
results"; including non-Bandcamp-subscribed notifications in
the OR'd predicate would either over-match (if their disjunct
isn't store-scoped) or be dead code (if it is). Dropping them
in JS before SQL keeps the query lean and intent clear.

### D6. Heard-mark removal is lazy

**Decision.** Marking a track heard does **not** splice it from the
in-memory `notifications` array. It re-appears excluded only on the
next `updateTracks` / pagination call, because `onlyNew: true`
filters heard tracks in the underlying search.

**Why.** Matches the existing `new` / `recent` behaviour: the
frontend keeps the row visible to avoid layout jumps mid-listen,
and the next list-refresh resyncs.

## Risks / Trade-offs

- **Wide-OR query plans degrade.** If a single user has very many
  notifications (e.g. hundreds), the OR'd predicate list grows and
  Postgres may pick a sequential scan over `track`. → Mitigated by
  the natural cap on notification counts (per-user, practically
  tens) and by the up-front "drop notifications that can't
  contribute under the store filter" step. If profiling shows it
  matters in production, the fallback is to rewrite the disjuncts
  as `UNION ALL` (one subquery per notification, deduplicated
  outside) — still one round trip, but the planner picks an index
  path per branch.
- **Predicate-builder duplication with `searchForTracks`.** Parsing
  the notification text into entity-id filters and free-text in JS
  duplicates a small amount of the regex logic that
  `searchForTracks` already has. → Mitigated by factoring the
  parsing into a tiny shared helper (kept next to the SQL
  predicate builder), so the two callers can't drift on
  `artist:NNN` / `label:NNN` syntax.
- **Cross-notification deduplication of the same track.** A track
  that matches two notifications appears once because the outer
  `SELECT` deduplicates implicitly via `GROUP BY track_id` (or via
  `DISTINCT`, depending on the final shape of the SQL). The
  picking rule is "first occurrence in `track_added DESC` order
  wins" — every duplicate is the same row, so the choice is
  cosmetic; no ambiguity surfaces to the user.
- **Pagination is not strictly stable across notification edits.**
  If the user adds / removes a notification while paginating, the
  predicate set shifts under their offset cursor and a tracklist
  refresh is needed. → Same caveat as every offset-based list in
  the app; no special handling.
- **`total` requires a separate `COUNT(DISTINCT …)` query.** That
  is the cost of giving the frontend an accurate "n of N"
  indicator. Run it in the same transaction as the page query so
  both observe the same snapshot. If `COUNT` itself becomes a
  hotspot, swap for an approximate-count strategy or drop `total`
  from the response and let the frontend infer "more" from a full
  page.

## Migration Plan

No data migration. The route is additive (`GET /tracks/notifications`
is new), the frontend bucket and Discover-dropdown link are
additive, and nothing existing changes shape. Deploy in one step;
rollback is a code revert.

## Open Questions

- Whether to issue the page query and the `COUNT(DISTINCT …)`
  total query in a single `WITH … SELECT` (one CTE feeding both
  the slice and the count) or as two statements in one
  transaction. The CTE form is one round trip; the two-statement
  form is simpler to read and lets the planner cost each shape
  independently. Pick at implementation time after sanity-checking
  `EXPLAIN` on both.
- Free-text predicate composition: the current `searchForTracks`
  builds the FTS source by aggregating `track_title`,
  `artist_name`, `release_name`, `label_name` into one string per
  track and then `HAVING TO_TSVECTOR(...) @@ ...`. In the combined
  query, that same composite source needs to be available to each
  disjunct that has free-text. Two viable paths: (a) build the
  composite once in an outer `GROUP BY` and apply each free-text
  disjunct in `HAVING`, or (b) reference a precomputed view /
  function that gives the composite per track. Decide at
  implementation time; (a) is the lower-effort start.
