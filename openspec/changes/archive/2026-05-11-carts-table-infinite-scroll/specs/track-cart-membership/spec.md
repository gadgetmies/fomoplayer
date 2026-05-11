## ADDED Requirements

### Requirement: Track rows include cart membership

Every track row returned by a track-fetching endpoint (the panel tracklist via `/me/tracks`, the carts view via `/carts/<uuid>` and `/me/carts/<uuid>`, search results via the search endpoint) SHALL include a `carts` field — an array of objects, each with a `uuid` property identifying a cart the track currently belongs to. A track that is in no cart SHALL have `carts: []` (empty array, not `null`, not absent). The array SHALL NOT carry the cart's internal numeric id; uuid is the user-facing identifier and the only stable cross-system reference.

Track rows SHALL NOT carry a singular `cart_id` field. Per-track cart membership lives exclusively on `carts`. The frontend SHALL NOT scan a cart's `tracks` array to discover which carts contain a given track.

#### Scenario: Track is in two carts

- **WHEN** a track is in the user's default cart (uuid `<A>`) and a custom cart (uuid `<B>`)
- **AND** the track is returned by any endpoint that produces a track row
- **THEN** the row includes `carts: [{ uuid: '<A>' }, { uuid: '<B>' }]` (order is not significant)

#### Scenario: Track is in no carts

- **WHEN** a track is in zero of the user's carts
- **AND** the track is returned by any endpoint that produces a track row
- **THEN** the row includes `carts: []`

#### Scenario: Track row carries no singular cart_id

- **WHEN** any track-fetching endpoint returns a track row
- **THEN** the row does not include a `cart_id` field; cart membership is exclusively on `carts`

### Requirement: In-cart badges read from `carts`, not from `cart.tracks`

The frontend's "in default cart" and "in cart X" badges (rendered by `Tracks.js` and `Player.js`) SHALL be derived from each track row's `carts` field by uuid match, not by scanning any cart's `tracks` array. The `cart.tracks` array is exclusively for *displaying* the cart's contents in the carts view; it MUST NOT be used as a membership-source-of-truth.

#### Scenario: User views the main tracklist and a track is in the default cart

- **WHEN** the user has a default cart with uuid `<A>` (`cart.is_default = true`)
- **AND** a rendered track row carries `carts: [{ uuid: '<A>' }]`
- **THEN** the row's "in default cart" badge is shown
- **AND** the badge logic does not depend on the default cart's `tracks` array having been fetched

#### Scenario: A track is in a non-default, non-viewed cart

- **WHEN** a track is in a cart the user has not navigated to (uuid `<B>`)
- **AND** the rendered track row carries `carts: [{ uuid: '<B>' }]`
- **THEN** the multi-cart "in carts" badge correctly reports that cart as containing the track
- **AND** the badge does not depend on that cart's `tracks` array having been fetched (which would be undefined for any cart other than the currently-viewed and the default — pre-existing limitation that this requirement removes)

### Requirement: `updateDefaultCart` is removed

The frontend SHALL NOT issue any separate fetch for the default cart's tracks on app load. The default-cart-membership badge is powered exclusively by the `carts` field on each track row, which is populated by the existing track-fetching endpoints. The default cart's metadata (`id`, `name`, `is_default`, `uuid`) continues to come from the carts list (`GET /me/carts`), which does not carry a `tracks` array.

#### Scenario: App mounts and loads initial state

- **WHEN** the user signs in and the app's `updateStatesFromServer` runs
- **THEN** no fetch is issued against `/me/carts/default` or its uuid equivalent purely to populate default-cart membership
- **AND** the in-default-cart badges on the first paint of the main tracklist render correctly because each track row already carries `carts`

### Requirement: PATCH /carts/:id/tracks updates `carts` on every visible copy of the affected track

When the user adds or removes a track via `PATCH /carts/:id/tracks`, the frontend SHALL find every state slice that holds a copy of the affected track (panel tracklist, search results, the currently-viewed cart's `tracks` array, queue, now-playing, etc.) and update the affected row's `carts` in place — appending `{ uuid }` on `add`, filtering it out on `remove`. The track row identity (everything except `carts`) SHALL NOT otherwise be replaced.

For the cart whose contents are currently displayed, the cart's own `tracks` array SHALL also be updated: prepend the new track row on `add` (matching the server's `track__cart_added DESC` ordering), splice out the matching id on `remove`.

#### Scenario: Track in panel and search results gets added to a cart

- **WHEN** a track row appears in both `state.tracksData.tracks.new` and `state.searchResults`
- **AND** the user adds that track to a cart with uuid `<X>` via the cart-button on either row
- **THEN** both copies of the row have `{ uuid: '<X>' }` appended to their `carts`
- **AND** any further "in cart `<X>`" badge on either copy renders true

#### Scenario: Track gets removed from a cart while the cart is viewed

- **WHEN** the user is viewing the cart with uuid `<X>`
- **AND** removes a track from that cart
- **THEN** the cart's `tracks` array has the track spliced out
- **AND** every copy of that track elsewhere in state has the entry with `uuid === '<X>'` removed from its `carts`
