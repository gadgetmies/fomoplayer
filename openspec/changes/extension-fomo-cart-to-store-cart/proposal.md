## Why

The browser extension already lets users *bring tracks into* Fomo Player from Bandcamp and Beatport. Once a DJ has curated tracks into a Fomo Player cart for a set, they then have to manually re-locate each track on the store and add it to that store's cart to actually buy it — friction that scales linearly with set size. This change closes the loop: take a chosen Fomo Player cart and push its tracks into the store's own cart, with end-of-run reporting for tracks not available on that store.

## What Changes

- New popup section on the Beatport and Bandcamp panels: a Fomo Player cart picker plus a "Push to store cart" button (start controls render only when the active tab is on the matching store).
- Beatport flow: one-way incremental sync into a Beatport cart named `FOMO: <fomoplayer cart name>` — list user's Beatport carts (`GET https://api.beatport.com/v4/my/carts/`), create the named cart if missing (`POST https://api.beatport.com/v4/my/carts/`), fetch existing items to de-dup, POST only the missing tracks (`POST /v4/my/carts/<id>/items/`). Bearer token sourced from `https://www.beatport.com/api/auth/session`.
- Bandcamp flow: bulk-open the track page (`tabs.create({ active: false })`) for each Fomo Player track resolved to a Bandcamp URL, in user-paced batches whose size is configured on the Options page (default 10, blank = no batching). User clicks "Open next batch" in the popup to advance.
- Run state owned by the MV3 service worker, persisted under `browser.storage.local.cartPushRun` so it survives popup unmount and worker idle/restart.
- One concurrent run across the whole extension.
- End-of-run summary panel in the popup with buckets `Added`, `Already in cart` (Beatport only), `Not on <store>`, `Failed`. `Copy skipped+failed` and `Download as text` actions for the skipped/failed buckets; `Dismiss` clears the run.
- New Options-page field `Bandcamp cart-push batch size` (number, blank-allowed; default 10), stored under `browser.storage.local.bandcampCartPushBatchSize`.

## Capabilities

### New Capabilities
- `extension-cart-to-store-cart-push`: the browser-extension feature that pushes a chosen Fomo Player cart's tracks toward a store-side cart (Beatport: API sync into a named cart; Bandcamp: batched tab-open), with run-state persistence and an end-of-run summary.

### Modified Capabilities
<!-- No existing capability specs are amended by this change. -->

## Impact

- **Browser extension code** (`packages/browser-extension/src/js/`):
  - New modules: `cart-push/beatport.js`, `cart-push/bandcamp.js`.
  - New popup component shared by the two panels: `popup/cart-push/CartPushSection.jsx`.
  - `service_worker.js` grows three message handlers: `cart-push:start`, `cart-push:open-next-batch`, `cart-push:dismiss`, plus a `cart-push:list-fomo-carts` lookup for the picker. Worker startup checks for and resumes an in-progress Beatport run.
  - `BeatportPanel.jsx` and `BandcampPanel.jsx` render the new `CartPushSection`.
  - `options.html` / `options.js` gain the batch-size field.
- **Persistent storage**: two new keys in `browser.storage.local` — `cartPushRun` (the active/last run object) and `bandcampCartPushBatchSize` (Options-page setting).
- **External APIs touched**: Beatport's `api.beatport.com/v4/my/carts/...` endpoints and `www.beatport.com/api/auth/session`. Both are already covered by the existing `https://*.beatport.com/*` host permission; no manifest changes.
- **Backend (`packages/back`)**: only relevant if the Fomo Player track-row `stores` JSON returned by `GET /api/me/carts/<id>` does not already expose the Beatport `item_id` and the Bandcamp track URL — in that case a small read-side addition to the existing cart-tracks query is part of this change, otherwise no backend change.
- **Out of scope for this change**: bidirectional sync, removing items from store carts, renaming or cleaning up the `FOMO:` cart, Spotify or other third stores, Bandcamp incremental sync (only-open-new-tracks across runs).
