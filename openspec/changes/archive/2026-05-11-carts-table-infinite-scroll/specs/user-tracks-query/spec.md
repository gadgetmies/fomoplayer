## ADDED Requirements

### Requirement: queryUserTracks returns `carts` per track

`queryUserTracks` SHALL include a `carts` field on every track row in every panel it returns (`new`, `recentlyAdded`, `heard`). The value is an array of objects of the shape `{ uuid: string }`, one per cart (owned by the requesting user) that contains the track. A track in no cart SHALL have `carts: []`. The numeric internal cart id SHALL NOT appear on the track row.

The aggregation MUST be a left-join over `track__cart` so a track in no cart still produces a row; the aggregate SHALL filter out rows from the left join's empty side and SHALL NOT include carts marked deleted.

#### Scenario: Track is in two of the user's carts

- **WHEN** `queryUserTracks` returns a row for a track that the requesting user has added to two carts with uuids `<A>` and `<B>`
- **THEN** that row's `carts` array contains `{ uuid: '<A>' }` and `{ uuid: '<B>' }` (order is not significant)
- **AND** no `cart_ids` or `cart_id` field appears on the row

#### Scenario: Track is in no cart

- **WHEN** `queryUserTracks` returns a row for a track that is in none of the user's carts
- **THEN** that row's `carts` array is `[]`

#### Scenario: Track is in another user's cart but not the requester's

- **WHEN** the track is in some other user's cart, but in none of the requester's carts
- **THEN** the row's `carts` is `[]` for the requester's response (cart membership is per-user-scoped)
