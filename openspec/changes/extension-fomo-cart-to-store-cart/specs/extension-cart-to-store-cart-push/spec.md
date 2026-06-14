## ADDED Requirements

### Requirement: Push a Fomo Player cart to the active store's cart from the popup

The browser-extension popup SHALL expose, on the Beatport panel and on the Bandcamp panel, a "Push Fomo Player cart" control that lets the user pick one of their Fomo Player carts and push its tracks toward that store's cart. The control's **start UI** (cart picker and push button) SHALL render only when the active browser tab is on the matching store — i.e. when the panel's `isCurrent` prop is truthy — consistent with how existing per-store sync controls are gated.

The cart picker SHALL be a `<select>` populated from `GET /api/me/carts`. Carts whose `deleted` is set, and the purchased cart, SHALL be omitted. The default cart SHALL be marked with a `(default)` suffix. The push button SHALL be disabled until a cart is picked.

#### Scenario: User on a Beatport tab sees the push control

- **WHEN** the active tab matches `https://*.beatport.com/*`
- **AND** the Beatport panel is rendered in the popup
- **THEN** the panel shows a Fomo Player cart picker and a `Push to Beatport cart "FOMO: <name>"` button (with `<name>` filled from the currently picked cart, or disabled if none)

#### Scenario: User on a Bandcamp tab sees the push control

- **WHEN** the active tab matches `https://*.bandcamp.com/*`
- **AND** the Bandcamp panel is rendered in the popup
- **THEN** the panel shows a Fomo Player cart picker and an `Open <N> tabs to push to Bandcamp` button (with `<N>` reflecting the resolved-Bandcamp-URL count, or disabled if no cart is picked)

#### Scenario: User on a non-store tab does not see the start UI

- **WHEN** the active tab is neither Beatport nor Bandcamp
- **THEN** neither panel renders a cart picker or push button
- **AND** if an in-flight run exists, the relevant panel still renders its run-state / summary (see "run-state surfaces regardless of active tab")

### Requirement: Beatport push is a one-way incremental sync into a named cart

When the user starts a Beatport push for Fomo Player cart **C**, the extension SHALL sync C's tracks into a Beatport cart named exactly `FOMO: <C.name>`. The sync SHALL be one-way: tracks are only ever **added** to the Beatport cart, never removed. The sync SHALL be **incremental**: tracks already present in the `FOMO: <C.name>` cart on Beatport SHALL NOT be re-POSTed.

The extension SHALL source the bearer token by fetching `https://www.beatport.com/api/auth/session` with `credentials: 'include'` and reading `token.accessToken` from the JSON response body. The extension SHALL list the user's Beatport carts via `GET https://api.beatport.com/v4/my/carts/` and match by exact `name === 'FOMO: <C.name>'`. If no match exists, the extension SHALL create one by POSTing `{ name: 'FOMO: <C.name>' }` to `https://api.beatport.com/v4/my/carts/`. The extension SHALL fetch the target cart's current items to build a de-dup `Set<item_id>`.

For each track in C, the extension SHALL look up the Beatport entry in the track's `stores` JSON (returned by the Fomo Player API) to find the Beatport `item_id`. The extension SHALL POST one item at a time to `https://api.beatport.com/v4/my/carts/<targetCartId>/items/` with `Authorization: Bearer <accessToken>` and body `{ item_id, item_type_id: 2, audio_format_id: 1, purchase_type_id: 1, source_type_id: 6 }`. All Beatport HTTP calls in this flow SHALL include the bearer token.

#### Scenario: Beatport cart does not yet exist for the chosen Fomo Player cart

- **WHEN** the user starts a Beatport push for a Fomo Player cart named `my-set`
- **AND** no cart named `FOMO: my-set` exists in `GET /v4/my/carts/`
- **THEN** the extension POSTs `{ name: 'FOMO: my-set' }` to `https://api.beatport.com/v4/my/carts/`
- **AND** uses the returned `id` as the target cart id for the rest of the run

#### Scenario: Beatport cart already exists and contains some of the tracks

- **WHEN** a Beatport cart named `FOMO: my-set` already contains item ids `{100, 200}`
- **AND** the Fomo Player cart contains tracks resolving to item ids `{100, 200, 300, 400}`
- **THEN** the extension POSTs only `300` and `400` to that cart's `items/` endpoint
- **AND** counts `100` and `200` in the `Already in cart` bucket of the summary

#### Scenario: A track has no Beatport availability

- **WHEN** a track in the Fomo Player cart has no Beatport entry in its `stores` JSON (no Beatport `item_id` resolvable)
- **THEN** the extension counts that track in the `Not on Beatport` bucket
- **AND** does not POST anything for it

#### Scenario: Per-track Beatport POST fails

- **WHEN** the POST for a single track returns a non-2xx response (any status code, including 401/403)
- **THEN** the extension records that track in the `Failed` bucket with the response `status` and `error`
- **AND** continues with the next track in the queue (the run does not abort)

#### Scenario: Create-cart on Beatport fails

- **WHEN** the POST to create the `FOMO: <name>` cart returns a non-2xx response
- **THEN** the run terminates in `failed` status with the error message "Could not create FOMO cart on Beatport — create a cart named 'FOMO: <name>' on Beatport and re-run"
- **AND** no items are POSTed

#### Scenario: Beatport session token cannot be sourced

- **WHEN** the request to `https://www.beatport.com/api/auth/session` returns non-2xx, or its response body has no `token.accessToken`
- **THEN** the run terminates in `failed` status with the error message "Not logged in to Beatport"
- **AND** no carts are listed, created, or POSTed

### Requirement: Bandcamp push opens track pages in user-paced batches

When the user starts a Bandcamp push for Fomo Player cart **C**, the extension SHALL open the Bandcamp track page for each resolvable track of C as a background tab. The extension SHALL NOT make any Bandcamp cart API call; the user completes the add-to-cart action in each opened tab.

The extension SHALL partition the resolved tracks into batches of size `N`, where `N` is read from `browser.storage.local.bandcampCartPushBatchSize` at the start of each run. If `N` is `null` / undefined / blank, all tracks SHALL open as a single batch. If `N` is a positive integer, batches of size `N` SHALL be opened one at a time, requiring an explicit user click on `Open next batch` in the popup to advance from one batch to the next.

For each tab opened, the extension SHALL call `browser.tabs.create({ url: trackUrl, active: false })` where `trackUrl` is the Bandcamp URL pulled from the track's `stores` JSON entry. Tracks with no Bandcamp entry, or a Bandcamp entry with no usable URL, SHALL go to the `Not on Bandcamp` bucket without opening a tab.

#### Scenario: Batch size 5 with 12 tracks resolved to Bandcamp URLs

- **WHEN** `bandcampCartPushBatchSize` is `5`
- **AND** 12 tracks in the Fomo Player cart resolve to Bandcamp URLs
- **THEN** the run starts with 5 tabs opened and `status === 'awaiting-next-batch'`
- **AND** when the user clicks `Open next batch`, the next 5 tabs open
- **AND** when the user clicks `Open next batch` a third time, the final 2 tabs open and `status` flips to `completed`

#### Scenario: Batch size blank with 12 tracks resolved

- **WHEN** `bandcampCartPushBatchSize` is blank / `null`
- **AND** 12 tracks resolve to Bandcamp URLs
- **THEN** all 12 tabs open at once
- **AND** `status` flips directly from `running` to `completed` with no `Open next batch` interaction

#### Scenario: Track has no Bandcamp availability

- **WHEN** a track in the Fomo Player cart has no Bandcamp entry in its `stores` JSON, or its Bandcamp entry has no usable URL
- **THEN** the extension counts that track in the `Not on Bandcamp` bucket
- **AND** does not open a tab for it

#### Scenario: Tab close mid-run does not affect the run

- **WHEN** a tab opened by the run is closed by the user before the next batch is requested
- **THEN** the run state does not change
- **AND** the next `Open next batch` click still advances `batchIndex` normally

### Requirement: Run state is owned by the service worker and persisted

The service worker SHALL be the sole writer of `browser.storage.local.cartPushRun`. The popup SHALL read this key on mount and react to `storage.onChanged` deltas; the popup SHALL NOT mutate it directly.

The run-state object SHALL include at minimum: `runId`, `store`, `fomoplayerCartId`, `fomoplayerCartName`, `status` (`'running' | 'awaiting-next-batch' | 'completed' | 'failed'`), `startedAt`, `completedAt`, `queue` (the resolved track list frozen at run start), `results` (the four buckets), and any store-specific fields (`processed` for Beatport, `batchSize` / `batchIndex` / `batchCount` for Bandcamp, `beatportCartId` and `beatportCartName` for Beatport, top-level `error` for `failed`).

The service worker SHALL persist the run-state object after every meaningful state transition, including after every individual Beatport POST. On worker startup the service worker SHALL read `cartPushRun`; if `status === 'running'` and `store === 'beatport'`, the service worker SHALL resume the POST loop from `queue[processed]`.

#### Scenario: Popup is closed and re-opened mid-Beatport-run

- **WHEN** the popup is closed while a Beatport run is `running`
- **AND** the user re-opens the popup
- **THEN** the popup re-reads `cartPushRun` and renders the same run-state UI on the Beatport panel (progress, bucket counts), regardless of the active tab

#### Scenario: Service worker idles and is woken mid-Beatport-run

- **WHEN** the service worker idles between two Beatport POSTs (with `processed` persisted at the last completed index)
- **AND** the service worker is later woken (by a message, startup, or any other event)
- **THEN** the service worker reads `cartPushRun`, sees `status === 'running'` and `store === 'beatport'`, and resumes the POST loop from `queue[processed]`
- **AND** any track that was in-flight at the moment of idle is re-POSTed; if Beatport accepts it the track ends up in `Added`; if Beatport rejects it as duplicate the track ends up in `Failed`

#### Scenario: Service worker idles between Bandcamp batches

- **WHEN** a Bandcamp run is in `awaiting-next-batch` and the service worker idles
- **AND** the user clicks `Open next batch` in the popup, sending `cart-push:open-next-batch`
- **THEN** the service worker wakes, reads `cartPushRun`, increments `batchIndex`, opens the next batch of tabs, and persists the updated state

### Requirement: Only one cart-push run is active at a time

While a run is in `running` or `awaiting-next-batch` status, the start button SHALL be disabled on both the Beatport panel and the Bandcamp panel. The popup SHALL surface a hint identifying which store the in-flight run belongs to so the user knows where to look (e.g., "A Beatport push is in progress — wait or dismiss it before starting another"). The service worker SHALL refuse a `cart-push:start` message while a non-terminal run exists; the message SHALL be a no-op in that state.

#### Scenario: User tries to start a Bandcamp push while a Beatport run is in flight

- **WHEN** a Beatport run is `running`
- **AND** the user navigates to a Bandcamp tab and tries to use the Bandcamp panel's push button
- **THEN** the Bandcamp push button is disabled
- **AND** a hint identifying the in-flight Beatport run is visible on the Bandcamp panel

#### Scenario: User tries to start a second run during awaiting-next-batch

- **WHEN** a Bandcamp run is `awaiting-next-batch`
- **AND** the user attempts to start a Beatport push
- **THEN** the Beatport push button is disabled
- **AND** sending `cart-push:start` directly to the service worker is a no-op (no new run starts)

### Requirement: End-of-run summary surfaces buckets and offers export

When `status` becomes `completed`, the relevant store's panel SHALL render a summary block listing four buckets and their counts: `Added`, `Already in cart` (Beatport only), `Not on <store>`, `Failed`. The summary SHALL render the matching panel's run state regardless of the active tab.

The summary SHALL provide an expand toggle (`[show]`) per non-`Added` bucket that reveals a list of the tracks in that bucket, formatted as `<Artist> — <Title>`, each linked to the Fomo Player track URL. The summary SHALL provide a `Copy skipped+failed` button that copies the union of the `Not on <store>` and `Failed` lists to the clipboard via `navigator.clipboard.writeText`, plain text, one track per line, with the response status and error included on `Failed` lines.

The summary SHALL provide a `Download as text` button that builds a `Blob` containing all four bucket lists plus run metadata (store, Fomo Player cart name, Beatport cart name where relevant, run timestamp), and triggers an `<a download>` with filename `fomo-push-<store>-<cart-slug>-<YYYYMMDD-HHMM>.txt`.

The summary SHALL provide a `Dismiss` button that clears `cartPushRun` from `browser.storage.local`, returning both panels to their idle UI (with start controls re-enabled subject to `isCurrent`).

When `status` becomes `failed`, the summary SHALL render only the top-level `error` and a `Dismiss` button — no bucket counts, no expand toggles, no copy/download buttons.

#### Scenario: Beatport run completes with mixed bucket outcomes

- **WHEN** a Beatport run finishes with `Added: 12`, `Already in cart: 5`, `Not on Beatport: 3`, `Failed: 1`
- **THEN** the Beatport panel's summary block shows all four counts
- **AND** clicking `[show]` next to `Not on Beatport` reveals 3 `<Artist> — <Title>` lines linking back to Fomo Player
- **AND** clicking `Copy skipped+failed` writes 4 lines to the clipboard (3 not-on-store + 1 failed)
- **AND** clicking `Download as text` triggers download of `fomo-push-beatport-<slug>-<YYYYMMDD-HHMM>.txt` containing all four bucket lists + run metadata

#### Scenario: Bandcamp run completes

- **WHEN** a Bandcamp run finishes
- **THEN** the Bandcamp panel's summary block shows `Tabs opened`, `Not on Bandcamp`, and `Failed` buckets (no `Already in cart`)
- **AND** the same expand / copy / download / dismiss controls are available

#### Scenario: Run fails at the create-cart step

- **WHEN** a Beatport run fails because `POST /v4/my/carts/` returned non-2xx
- **THEN** the summary block on the Beatport panel shows only the error message and a `Dismiss` button
- **AND** no bucket counts, no `[show]` toggles, no `Copy` / `Download` buttons are rendered

#### Scenario: Dismiss clears the run

- **WHEN** the user clicks `Dismiss` on a `completed` or `failed` summary
- **THEN** `cartPushRun` is removed from `browser.storage.local`
- **AND** both panels revert to their idle UI
- **AND** the push button re-enables on the matching store's panel (subject to `isCurrent`)

### Requirement: Bandcamp batch size is configured on the Options page

The extension Options page SHALL expose a numeric input field labelled `Bandcamp cart-push batch size`. The field SHALL accept blank or any positive integer, with no upper bound. New installs SHALL default to `10`. A non-blank value that is not a positive integer SHALL revert the field to the last valid value with an inline error; blank SHALL NOT be treated as an error — it is the explicit "no batching, open everything in one batch" signal.

The field's value SHALL be persisted to `browser.storage.local.bandcampCartPushBatchSize` as a number (when set) or `null` (when blank). The service worker SHALL read this value at the start of each Bandcamp run; mid-run changes SHALL NOT affect the in-flight run.

#### Scenario: First-time use after install

- **WHEN** a user installs the extension for the first time and opens the Options page
- **THEN** the `Bandcamp cart-push batch size` field shows `10`
- **AND** `browser.storage.local.bandcampCartPushBatchSize` is `10`

#### Scenario: User sets the field to blank

- **WHEN** the user clears the field
- **AND** the change is saved
- **THEN** `browser.storage.local.bandcampCartPushBatchSize` is `null`
- **AND** subsequent Bandcamp runs open every resolved track in a single batch

#### Scenario: User enters an invalid value

- **WHEN** the user enters `0`, `-3`, or `abc` and tries to save
- **THEN** the field reverts to the last valid value
- **AND** an inline error explains the constraint
- **AND** `browser.storage.local.bandcampCartPushBatchSize` is not updated

#### Scenario: Setting changes mid-run

- **WHEN** a Bandcamp run is in `awaiting-next-batch` and the user changes the Options-page batch size
- **THEN** the new value is persisted to `browser.storage.local`
- **AND** the in-flight run continues with the batch size it was started with
- **AND** the next run started after dismissal picks up the new value
