## ADDED Requirements

### Requirement: Cart pages can be filtered by review state and carry review counts

`GET /carts/:id` SHALL accept a `review` query parameter (`to-review`, `accepted` or `rejected`; absent means all tracks) alongside the existing `store`, `offset` and `limit` parameters. When the caller owns the cart, the response SHALL page through only the tracks matching both filters (`page.total` counts only those), each track row SHALL carry `reviewState` (`null` for to review, `'accepted'` or `'rejected'`), and `cart` SHALL carry `review: { enabled, counts: { toReview, accepted, rejected, all }, storeCounts: [{ store, count }] }`, where `counts` respect the `store` filter and `storeCounts` cover the whole cart. When the caller does not own the cart, `review` SHALL be ignored and none of these review fields SHALL be present.

#### Scenario: Owner pages through accepted tracks

- **WHEN** the owner requests `GET /carts/<uuid>?review=accepted&offset=0&limit=20` for a cart with 40 accepted tracks out of 300
- **THEN** the response holds the 20 most recently added accepted tracks, `page.total` is 40, and `cart.review.counts.accepted` is 40

#### Scenario: Store and review filters combine

- **WHEN** the owner requests `?review=rejected&store=bandcamp`
- **THEN** only rejected Bandcamp tracks are returned and `cart.review.counts` count only Bandcamp tracks
- **AND** `cart.review.storeCounts` still lists every store in the cart with its full count

#### Scenario: Non-owner request

- **WHEN** another user requests `GET /carts/<uuid>?review=accepted` for a public cart
- **THEN** all the cart's tracks are paged as without the parameter, and no row carries `reviewState` and `cart` carries no `review`

### Requirement: Loading more after tracks leave the filtered list

When review is on and tracks have left the loaded, review-filtered list (decided, removed or moved), the next page request SHALL use as `offset` the number of rows still loaded in that list, so no track is skipped when the server-side filtered set has shrunk.

#### Scenario: Decisions before scrolling

- **WHEN** the To review tab has loaded 20 tracks, the owner accepts 5 of them, and then scrolls to the bottom
- **THEN** the next request is `GET /carts/<uuid>?review=to-review&offset=15&limit=20`
- **AND** the track that was 21st before the decisions appears in the list
