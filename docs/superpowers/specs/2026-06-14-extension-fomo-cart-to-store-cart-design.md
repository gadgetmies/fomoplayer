# Extension: push a Fomo Player cart to a store cart

## Background and goal

The browser extension already lets a Fomo Player user *bring tracks into*
Fomo Player from Bandcamp and Beatport (single-page scrape, feed sync,
wishlist sync, the per-track "Add to Fomo Player" dropdown). This change adds
the opposite direction: push the contents of a chosen Fomo Player cart to the
store's *own* cart (Bandcamp / Beatport), so the user can finish purchasing
the set.

Stores model "cart" differently:

- **Beatport** has a first-class cart API. Items are added by POSTing to
  `/v4/my/carts/<cart_id>/items/` with a small structured body. Multiple
  named carts per user are supported.
- **Bandcamp** requires the buyer to set a price for every release (and to
  click "add to cart" themselves). There is no automated add-to-cart API.

The two flows therefore differ. Beatport becomes a true one-way incremental
sync into a named cart; Bandcamp is a bounded bulk-open of the relevant
track pages so the user can complete each purchase manually.

Out of scope:

- Bidirectional sync (no removals from a store cart, no store→Fomo Player
  propagation, no rename or cleanup of the Beatport "FOMO: …" cart when the
  Fomo Player cart is renamed or deleted).
- Stores other than Bandcamp and Beatport (Spotify intentionally excluded).
- Buying / paying flow itself. The user always completes the purchase in the
  store's own UI.

## User-visible behaviour

### Trigger

Each store panel in the extension popup
(`packages/browser-extension/src/js/popup/BeatportPanel.jsx` and
`BandcampPanel.jsx`) gains a "Push Fomo Player cart" section.

The **start controls** (cart picker + push button) render only when the user
is on the matching store — i.e. only when the panel's `isCurrent` prop is
truthy. The active-tab gating matches how existing per-store controls (e.g.
"Send tracks from current page", "Sync wishlist") already work.

A **run-state and summary panel** for the matching store renders whenever
there is run state in storage for that store, regardless of `isCurrent`, so
the user can leave the store's tab and still see the run progress and the
final summary.

### Start controls

When `isCurrent` and there is no in-flight run:

- A `<select>` of the user's Fomo Player carts, populated from
  `GET /api/me/carts`. Default cart marked with a "(default)" suffix.
  Carts with `deleted` set, and the purchased cart, are omitted.
- A push button:
    - Beatport: `Push to Beatport cart "FOMO: <name>"`
    - Bandcamp: `Open <N> tabs to push to Bandcamp` (where N is the count
      of Fomo Player tracks resolved as having a Bandcamp URL)
  Disabled until a cart is picked.

### One concurrent run

Only one cart-push run is active at a time across the whole extension. While
a run is active, the start button on *both* panels (Beatport and Bandcamp)
is disabled with a hint such as "A Beatport push is in progress — wait or
dismiss it before starting another." The hint references the in-flight
store by name so the user knows where to look.

### Beatport flow (incremental sync)

For a chosen Fomo Player cart C:

1. Worker fetches an access token from
   `https://www.beatport.com/api/auth/session` with `credentials: 'include'`
   and reads `token.accessToken`. A non-2xx response, missing
   `token.accessToken`, or a parse failure means the user is not logged in
   to Beatport — the run fails fast with that message before any items are
   sent.
2. Worker lists the user's Beatport carts via
   `GET https://api.beatport.com/v4/my/carts/` with
   `Authorization: Bearer <accessToken>`. Response shape:
   `[ { id, name, default, person_id }, … ]`.
3. Worker looks for a cart whose `name` equals `FOMO: <C.name>` (verbatim,
   exact match). If found, that's the target. If not found, worker creates
   it via
   `POST https://api.beatport.com/v4/my/carts/` with body
   `{ name: 'FOMO: <C.name>' }`. Response shape:
   `{ default, id, name, person_id, releases: [], tracks: [] }`. The
   returned `id` is the target cart id.
4. Worker fetches the target cart's existing items. The exact endpoint
   shape is recorded as a single lookup
   `getBeatportCartItemIds(cartId, bearer) → Set<item_id>`. From the
   sample request the user supplied
   (`GET https://api.beatport.com/v4/my/carts/<cart_id>/?items=false&country=FI`),
   the implementer first tries
   `GET /v4/my/carts/<cart_id>/?items=true` (omitting `country` and seeing
   if the API still answers); if that does not return per-item ids, the
   implementer falls back to whichever sibling endpoint exposes them
   (likely `GET /v4/my/carts/<cart_id>/items/`). Only the de-dup `Set<int>`
   leaves this lookup; the rest of the response shape is irrelevant. The
   `releases[]` array on a cart is **not** consulted for de-dup in v1: if a
   release containing a fomoplayer track is already in the user's Beatport
   cart, the per-track POST will still fire (Beatport may accept it,
   making the user pay twice, or reject it, in which case it lands in
   `failed`; either is recoverable from the summary).
5. For every track row in C, worker looks up the Beatport entry in the
   track's `stores` JSON and reads its Beatport `item_id`. Tracks with no
   Beatport entry go to `results.notOnStore` (rendered as "Not on
   Beatport" in the summary). Tracks whose `item_id` is already in the
   de-dup set go to `results.alreadyInBeatportCart`. The remainder is the
   queue to POST.
6. For each queued track, worker POSTs to
   `https://api.beatport.com/v4/my/carts/<targetCartId>/items/` with
   `Authorization: Bearer <accessToken>` and body
   `{ item_id, item_type_id: 2, audio_format_id: 1, purchase_type_id: 1,
     source_type_id: 6 }`. A 2xx response → `results.added`. Any non-2xx
   → `results.failed` (carrying `{ status, error }`). The run **does
   not abort** on per-track failures, including 401/403 — see "Login lost
   mid-run" below.
7. When the queue is exhausted the run flips to `completed` and the
   completion summary surfaces in the Beatport panel.

If the create-cart call (step 3) returns non-2xx, the run fails with
"Could not create FOMO cart on Beatport — create a cart named
'FOMO: <C.name>' on Beatport and re-run" so the user has a deterministic
manual fallback. The run records the create-cart failure and stops; no
items are POSTed.

### Bandcamp flow (bulk-open in user-paced batches)

For a chosen Fomo Player cart C:

1. Worker resolves a track URL for every track in C by reading the Bandcamp
   entry of its `stores` JSON and pulling the entry's `url`. Tracks with no
   Bandcamp entry — or with a Bandcamp entry but no usable URL — go to
   `results.notOnStore` upfront (rendered as "Not on Bandcamp" in the
   summary).
2. Worker reads `bandcampCartPushBatchSize` from
   `browser.storage.local` (set on the extension Options page; default 10
   for new installs; blank means "no batching"). This is the batch size N.
3. Worker partitions the resolved-track list into batches of size N (one
   single batch of the full list if N is blank).
4. Worker opens batch 1 by calling
   `browser.tabs.create({ url: trackUrl, active: false })` for each track
   in that batch, then flips run state to `awaiting-next-batch` (or
   directly to `completed` if there's only one batch).
5. The popup shows an `Open next batch (M tracks)` button while
   `status === 'awaiting-next-batch'`. Clicking it sends
   `cart-push:open-next-batch` to the worker, which advances `batchIndex`
   and opens the next batch.
6. When the last batch is opened the run flips to `completed` and the
   summary surfaces.

The worker does not observe tab closures and does not auto-advance. Whether
the user actually adds each track to Bandcamp's cart, or closes the tab
without buying, is intentionally not detected. `results.added` on a
Bandcamp run means "the tab was opened"; the user understands the
semantics from the in-popup copy (e.g., "10 tabs opened — finish the
purchase in each").

### Completion summary

When `status === 'completed'`, both panels (only the relevant one for the
run that just completed) show a summary block. Beatport's block:

```
✓ Pushed "FOMO: my-set" to Beatport
  Added                12
  Already in cart       5
  Not on Beatport       3   [show]
  Failed                1   [show]

  [ Copy skipped+failed ]  [ Download as text ]  [ Dismiss ]
```

Bandcamp's block follows the same shape with buckets
`Tabs opened`, `Not on Bandcamp`, plus a single notice that the user must
finish the purchase in each opened tab. There is no "already-in-cart"
bucket for Bandcamp (no de-dup).

`[show]` toggles a `<ul>` of per-track lines formatted as `<Artist> —
<Title>`, each linked to that track's Fomo Player page.

`[Copy skipped+failed]` calls `navigator.clipboard.writeText` with a plain
text dump of those two buckets, one track per line. Failed lines include
their `status` and `error`.

`[Download as text]` builds a `Blob` of the full summary (all four buckets
+ run metadata: store, fomoplayer cart name, Beatport cart name where
relevant, run timestamp), calls `URL.createObjectURL`, and triggers an
`<a download>` click. Filename:
`fomo-push-<store>-<cart-slug>-<YYYYMMDD-HHMM>.txt`.

`[Dismiss]` clears `cartPushRun` from `browser.storage.local`. Both panels
go back to their idle UI; start controls re-enable (subject to
`isCurrent`).

### Failure summary

When `status === 'failed'` (e.g. Beatport not logged in, create-cart
non-2xx), the summary block degrades to a single error line + Dismiss
button. No bucket counts.

## Architecture

### State ownership

The MV3 service worker owns the run. It writes a single object to
`browser.storage.local` under key `cartPushRun`; the popup mounts, reads
that key, subscribes to `storage.onChanged`, and reflects whatever is
there. The popup is **never** the source of truth — it is a thin
controller that issues `cart-push:start` / `cart-push:open-next-batch` /
`cart-push:dismiss` messages and re-renders on storage changes.

This survives both popup unmount (MV3 popups close on focus loss) and
service-worker idle/restart, because all the run state lives in storage,
and the worker is structured to resume from storage on wake-up.

### Run-state shape

```js
{
  runId,                       // uuid; lets the popup detect a fresh run
  store: 'beatport' | 'bandcamp',
  fomoplayerCartId,
  fomoplayerCartName,
  status: 'running' | 'awaiting-next-batch' | 'completed' | 'failed',
  startedAt,                   // ISO timestamp
  completedAt,                 // ISO timestamp, set when status becomes
                               // 'completed' or 'failed'

  // resolved queue of tracks to action (Beatport: queued for POST after
  // de-dup; Bandcamp: queued for tab-open). Frozen at the start of the
  // run so worker restart can resume without re-resolving.
  queue: [ { trackId, artist, title, fomoplayerUrl,
             beatportItemId | bandcampUrl } ],

  // Beatport-only
  beatportCartId,              // id of the FOMO: ... cart
  beatportCartName,            // 'FOMO: <C.name>'
  processed,                   // index into `queue` of next track to POST

  // Bandcamp-only
  batchSize,                   // null (single batch) or positive int
  batchIndex,                  // 0-based index of the next batch to open
  batchCount,                  // total batches (1 if batchSize is null)

  // results accumulate as the run progresses
  results: {
    added:                [ { trackId, artist, title, fomoplayerUrl } ],
    alreadyInBeatportCart:[ … ],   // Beatport only
    notOnStore:           [ … ],
    failed:               [ { …, status, error } ]
  },

  // top-level error for the 'failed' terminal state
  error,
}
```

The popup component reads `cartPushRun` once on mount and then reacts to
`storage.onChanged` deltas. The worker is the sole writer.

### Beatport worker module

A new `packages/browser-extension/src/js/cart-push/beatport.js` module
exports the run-driving function. Its public surface is small:

- `startBeatportRun({ fomoplayerCartId })` — does steps 1–4 of the
  Beatport flow, writes the initial `cartPushRun`, then drives the POST
  loop.
- `resumeBeatportRun()` — picks up an in-progress run from storage. Called
  from the worker's startup path so an idle-restart resumes the loop.

Internal helpers:

- `fetchBeatportAccessToken()` — `fetch('https://www.beatport.com/api/auth/
  session', { credentials: 'include' }).then(parse)`.
- `listBeatportCarts(bearer)` — `GET /v4/my/carts/`.
- `createBeatportCart(name, bearer)` — `POST /v4/my/carts/` body `{name}`.
- `getBeatportCartItemIds(cartId, bearer)` — opaque lookup that returns
  `Set<int>` of item ids already in the target cart (exact GET path
  determined during implementation; see Beatport flow step 4).
- `postBeatportCartItem(cartId, itemId, bearer)` — POST one item.

The POST loop reads `cartPushRun` from storage, finds the first un-processed
queue index, performs the POST, mutates `results` + bumps `processed`, and
persists. Repeats until the queue is exhausted. Persisting *after* every
POST means a worker restart loses at most one in-flight POST (which is
either harmless re-tried — Beatport will tell us it's already in cart — or
recorded as failed and continued past).

### Bandcamp worker module

A new `packages/browser-extension/src/js/cart-push/bandcamp.js` module
exports:

- `startBandcampRun({ fomoplayerCartId })` — resolves tracks, partitions
  into batches, writes `cartPushRun`, opens batch 0.
- `openNextBandcampBatch()` — increments `batchIndex` and opens the
  corresponding batch's tabs. Called by the worker's message handler for
  `cart-push:open-next-batch`.

Internal helpers are limited to track resolution and tab-opening; there is
no Bandcamp API interaction at all in this module.

### Service-worker glue

`service_worker.js` grows three new message handlers:

- `cart-push:start` — `{ store, fomoplayerCartId }` → dispatches to either
  `startBeatportRun` or `startBandcampRun`. Refuses if there's already an
  active run (`status` in `['running', 'awaiting-next-batch']`).
- `cart-push:open-next-batch` — calls `openNextBandcampBatch()`.
- `cart-push:dismiss` — clears `cartPushRun` from storage. Refuses if
  `status` is `'running'` (a Beatport mid-loop dismiss would leave a
  half-pushed cart; require user wait or explicit
  "abort" — design choice for v2, not v1).

On worker startup (`runtime.onStartup` and `runtime.onInstalled`, and at
the top of any other message handler that wakes the worker), the worker
reads `cartPushRun`; if `status === 'running'` and `store === 'beatport'`,
it calls `resumeBeatportRun()`.

### Track resolution (Fomo Player side)

Both flows hit the existing `GET /api/me/carts/<cartId>` Fomo Player API
to fetch the chosen cart's contents. That endpoint returns each track row
with a `stores` JSON field whose entries describe per-store availability.

The implementer reads the current `stores` shape (the design intentionally
does not hard-code field names) and pulls:

- For Beatport: the Beatport item id integer.
- For Bandcamp: the canonical track URL.

If the implementer finds the `stores` JSON does not carry one of these
fields, the design's fallback is to add it to the API response — this is
a small backend change tied to the same OpenSpec change, not a separate
piece of work.

### Popup components

- `BeatportPanel.jsx` and `BandcampPanel.jsx` each gain a
  `CartPushSection` child component. The two child components are
  similar enough to share a generic `CartPushSection` in
  `popup/cart-push/CartPushSection.jsx`, parameterised by the store —
  fine to start that way, with the two store-specific differences
  (e.g. "Open next batch" only renders for Bandcamp) handled by
  conditional rendering inside the shared component.
- Cart-list fetching for the picker reuses the worker's existing
  `getUserCarts` pattern (see `service_worker.js`); a new
  `cart-push:list-fomo-carts` worker message returns the user's carts
  filtered to non-deleted, non-purchased, suitable for the picker.

### Options page

`options.html` / `options.js` gains a single new field:

- Label: `Bandcamp cart-push batch size`
- Input: `<input type="number" min="1" step="1">`, blank-allowed.
- Default for new installs: `10`.
- Validation: a non-blank value that isn't a positive integer reverts to
  the last valid value with an inline error. Blank is **not** an error —
  it's the explicit "no batching" signal.
- Persistence: `browser.storage.local.bandcampCartPushBatchSize` (number
  or `null`).
- Help text under the input:
  *"How many Bandcamp track pages to open per batch. Blank means open
  every track in one batch (use with care for big carts)."*

## Lifecycle and edge cases

**Popup re-open during a run.** Popup mounts → reads `cartPushRun` from
storage → renders matching panel's section. Subscribes to
`storage.onChanged`. No worker round-trip.

**Worker idle / restart mid-Beatport-run.** Worker persists `processed`
and per-track results after every POST. On wake, `resumeBeatportRun()`
picks up at `queue[processed]`. A POST in-flight at the moment of
restart is lost; the next resume will re-POST that item, Beatport will
either accept it or reject it as a duplicate — either outcome lands in a
correct summary bucket.

**Worker idle between Bandcamp batches.** Expected. Wakes on
`cart-push:open-next-batch`, reads state from storage, opens the next
batch.

**Login lost mid-Beatport-run.** First failing POST yields 401/403, lands
in `results.failed`. Per design, the run continues. Every subsequent POST
will also 401 and go to `failed`. The final summary shows the dead-session
shape (`Failed: <large number>`); the text-export includes the 401 status
on every row so the user can diagnose. No special-casing of auth failure.

**Not logged in at run start.** The session-fetch step fails before any
items POST; run flips to `failed` with the error
"Not logged in to Beatport".

**Beatport API endpoint shape drift.** If a Beatport endpoint changes
shape, the failure surface is the relevant helper (`listBeatportCarts`,
`createBeatportCart`, `getBeatportCartItemIds`, or
`postBeatportCartItem`). Each helper logs the raw response on parse
failure (same pattern as the existing `fetchJsonForLogging` in
`service_worker.js`) so the failure mode is debuggable from the user's
console.

**Beatport CORS / Origin.** The browser-devtools CORS error the user hit
during exploration was an origin-of-the-devtools-context artifact, not an
extension-runtime issue. The MV3 service worker, granted
`https://*.beatport.com/*` host permissions, makes direct cross-origin
fetches without the same CORS checks. If implementation discovers the API
*does* enforce `Origin: https://www.beatport.com` from the worker, the
fallback is to relay the request through a content script on
`www.beatport.com` (which has the right Origin naturally). No new
permissions either way.

**Tab close during a Bandcamp run.** Worker does not observe tab
closures. Batch advance is manual. Tab close is purely a user-side
"I'm done with this tab" signal.

**Empty target.** If, after resolution + de-dup, the queue is empty: run
goes straight to `completed` with `added: 0`. The summary still shows the
relevant skipped buckets so the user understands why nothing was pushed.

**Fomo Player cart renamed.** Next Beatport sync creates a new
`FOMO: <new name>` cart. The old one stays on Beatport untouched. v1 does
not link Fomo Player cart id to Beatport cart id; name match is the only
linkage. Acceptable for v1; revisit if it becomes a friction point.

**Fomo Player cart deleted.** The `FOMO: <name>` cart on Beatport stays.
Same v1 stance — no cleanup.

**Concurrency.** One run at a time. Attempting to start a second run
while one is in flight is a no-op in the worker plus a disabled button in
the popup.

**Permissions.** No new manifest permissions. `https://*.beatport.com/*`
already covers `api.beatport.com` and `www.beatport.com/api/auth/session`.
`tabs` and `scripting` already in the manifest.

## Testing

- **Unit tests** for the Beatport module: stub `fetch` and exercise
  `startBeatportRun` end-to-end: cart not found → create; cart found →
  reuse; partial results bucket-counting; resume from a half-processed
  `cartPushRun`.
- **Unit tests** for the Bandcamp module: batch partitioning (N=null,
  N=1, N=middle); `openNextBandcampBatch` advances `batchIndex` and
  transitions to `completed` after the last batch.
- **Manual / integration**: a Bandcamp run with two batches of size 2
  (4 tracks total) — verify both batches open the right URLs and the
  popup transitions correctly. A Beatport run against the user's real
  account — verify the FOMO: cart appears, items land in it, the
  summary buckets match what actually happened.

## Out-of-scope (deferred)

- Removing a track from the Beatport cart when removed from the Fomo
  Player cart.
- Surfacing Beatport-cart-side state back to Fomo Player.
- Renaming the FOMO: cart on Beatport when the Fomo Player cart is
  renamed; cleaning up orphaned FOMO: carts.
- A "abort current run" button (you currently dismiss only after the run
  finishes).
- Storing the Beatport cart id by Fomo Player cart id (would let the
  sync survive a rename — v2).
- Bandcamp incremental sync (record which tracks were pushed in a prior
  run, only open new ones — v2 if the user asks for it).
- Spotify or any third store.
