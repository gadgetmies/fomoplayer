## 1. Backend: confirm track-row exposes Beatport item_id and Bandcamp URL

- [x] 1.1 Inspect the `stores` JSON in the response of `GET /api/me/carts/<id>` against a real cart; identify the field that carries the Beatport `item_id` (integer) and the field that carries the Bandcamp track URL.
  - Finding: the `track_details` function (`migrations/sqls/20250112163059-remove-preview-url-not-null-from-track-details-up.sql`) already emits `stores[].trackId` (`store__track_store_id`, `text`, parseable as integer — this is the Beatport `item_id`) and `stores[].url` (`store__track_url`, the store's track page URL — for Bandcamp rows this is the track URL we open).
- [x] 1.2 If either field is missing, extend the relevant cart-tracks query in `packages/back/routes/shared/db/cart.js` (and any feeding view/function) so the `stores` JSON entries returned to the frontend include `item_id` for Beatport rows and `url` for Bandcamp rows. Re-use existing column names if present; otherwise add them.
  - No-op: existing `trackId` / `url` fields are sufficient (per "Re-use existing column names if present"). The extension's `resolveCartTracks` reads `entry.trackId` for Beatport and `entry.url` for Bandcamp.
- [x] 1.3 If a backend change was made, add or extend a test in `packages/back/test/` that asserts `GET /api/me/carts/<id>` returns the new fields for a track with both store availabilities.
  - No-op: no backend change.

## 2. Extension: storage shape and constants

- [x] 2.1 In `packages/browser-extension/src/js/cart-push/state.js` (new file), define helpers `readRun()` and `writeRun(partial)` over `browser.storage.local.cartPushRun`, plus a `clearRun()` and a `withRunLock(fn)` helper that no-ops if a non-terminal run already exists. Define the `RunStatus` constants and the bucket key constants.
- [x] 2.2 Define the `BANDCAMP_BATCH_SIZE_KEY = 'bandcampCartPushBatchSize'` constant and a `readBandcampBatchSize()` helper that returns a positive integer or `null` (treating missing as `10` for new installs by initialising at first install in `service_worker.js`'s init block).

## 3. Extension: track resolution from a Fomo Player cart

- [x] 3.1 In `cart-push/resolve.js` (new file), implement `resolveCartTracks({ store, fomoplayerCartId }) → { queue, notOnStore }` that calls the existing `apiFetch('/api/me/carts/<id>')`, iterates `tracks[]`, reads each row's `stores` JSON, and pulls the Beatport `item_id` (for `store === 'beatport'`) or Bandcamp URL (for `store === 'bandcamp'`). Tracks lacking the field go into `notOnStore` with `{ trackId, artist, title, fomoplayerUrl }`; the rest become the `queue`.
- [x] 3.2 Unit-test `resolveCartTracks` with a stub `apiFetch` covering: both fields present, only Beatport present, only Bandcamp present, neither present.

## 4. Extension: Beatport cart-push module

- [x] 4.1 In `cart-push/beatport.js` (new file), implement `fetchBeatportAccessToken()`: `fetch('https://www.beatport.com/api/auth/session', { credentials: 'include' })`, parse JSON, return `body.token.accessToken`. Return `null` on non-2xx / missing field.
- [x] 4.2 Implement `listBeatportCarts(bearer)`: `GET https://api.beatport.com/v4/my/carts/` with `Authorization: Bearer <bearer>`; return parsed list `[ { id, name, default, person_id }, … ]`.
- [x] 4.3 Implement `createBeatportCart(name, bearer)`: `POST https://api.beatport.com/v4/my/carts/` with body `{ name }` and the bearer header; return the created cart.
- [x] 4.4 Implement `getBeatportCartItemIds(cartId, bearer) → Set<int>`: probe `GET https://api.beatport.com/v4/my/carts/<cartId>/?items=true`. If that response carries per-item ids, parse them into a Set. If not, fall back to `GET /v4/my/carts/<cartId>/items/`. Log raw bodies on parse failure (mirror the existing `fetchJsonForLogging` pattern in `service_worker.js`).
- [x] 4.5 Implement `postBeatportCartItem(cartId, itemId, bearer)`: `POST .../carts/<cartId>/items/` with body `{ item_id: itemId, item_type_id: 2, audio_format_id: 1, purchase_type_id: 1, source_type_id: 6 }`. Return `{ ok: true }` on 2xx; `{ ok: false, status, error }` on non-2xx.
- [x] 4.6 Implement `startBeatportRun({ fomoplayerCartId })`: gates on the run-lock; sources bearer (fail-fast on missing → write `cartPushRun` with `status: 'failed'`, error `Not logged in to Beatport`, and stop); finds/creates the `FOMO: <C.name>` cart (on cart-create failure → terminate with the create-cart error message from the spec); pre-fetches existing items into a `Set<item_id>`; computes the queue from the resolved tracks (de-dup vs `alreadyInBeatportCart`, push remaining to `queue`); writes the initial `cartPushRun` to storage; then calls `runBeatportLoop()`.
- [x] 4.7 Implement `runBeatportLoop()`: read `cartPushRun`, loop from `processed` to end of `queue`, POSTing each item; after each POST, mutate `results.added` / `results.failed` and bump `processed`, persist the whole `cartPushRun` (so a restart resumes at the right index). When `processed === queue.length`, set `status: 'completed'`, `completedAt`, and persist.
- [x] 4.8 Implement `resumeBeatportRun()`: reads `cartPushRun`; if `status === 'running'` and `store === 'beatport'`, calls `runBeatportLoop()` directly. Otherwise a no-op.
- [x] 4.9 Unit-test the Beatport flow with stubbed `fetch`: (a) cart not found → create, (b) cart found → reuse, (c) tracks bucket-classified correctly (added / alreadyInBeatportCart / notOnStore / failed), (d) `resumeBeatportRun` picks up at the right index from a half-processed storage state, (e) create-cart non-2xx terminates with the documented message, (f) auth-session non-2xx terminates with "Not logged in to Beatport".

## 5. Extension: Bandcamp cart-push module

- [x] 5.1 In `cart-push/bandcamp.js` (new file), implement `startBandcampRun({ fomoplayerCartId })`: gates on the run-lock; resolves tracks (the `notOnStore` bucket from `resolveCartTracks` becomes `results.notOnStore`); reads `bandcampCartPushBatchSize` from storage; partitions the queue into batches (`null` → single batch); writes the initial `cartPushRun` with `batchIndex: 0`; opens batch 0; sets `status` to `awaiting-next-batch` (or `completed` if there is only one batch); persists.
- [x] 5.2 Implement `openNextBandcampBatch()`: reads `cartPushRun`, increments `batchIndex`, opens the next batch's tabs via `browser.tabs.create({ url, active: false })`, appending each opened track to `results.added`. When `batchIndex + 1 === batchCount`, sets `status: 'completed'` and `completedAt`; otherwise leaves `status: 'awaiting-next-batch'`. Persists.
- [x] 5.3 Unit-test the partitioning: N=null with 12 → 1 batch of 12; N=5 with 12 → 5/5/2; N=1 with 3 → 1/1/1.
- [x] 5.4 Unit-test `openNextBandcampBatch` advancing `batchIndex` and the run transitioning to `completed` after the last batch is opened.

## 6. Extension: service-worker glue

- [x] 6.1 In `service_worker.js`, import the cart-push modules.
- [x] 6.2 Add a `cart-push:list-fomo-carts` handler that calls the existing `getUserCarts` and returns the user's carts filtered to non-deleted, non-purchased (suitable for the picker).
- [x] 6.3 Add a `cart-push:start` handler that dispatches `{ store, fomoplayerCartId }` to either `startBeatportRun` or `startBandcampRun`. Refuse (return `{ ok: false, error }`) if `cartPushRun.status` is in `['running', 'awaiting-next-batch']`.
- [x] 6.4 Add a `cart-push:open-next-batch` handler that calls `openNextBandcampBatch()`. No-op if there is no Bandcamp run in `awaiting-next-batch`.
- [x] 6.5 Add a `cart-push:dismiss` handler that clears `cartPushRun` (refuses if `status === 'running'`).
- [x] 6.6 In the existing service-worker init IIFE (and from a `runtime.onStartup` listener if not already present), call `resumeBeatportRun()` on wake. Make `runBeatportLoop()` re-entrant so a duplicate resume is harmless.
- [x] 6.7 In the same init block, default `bandcampCartPushBatchSize` to `10` when the key is absent (do not overwrite an existing `null` set deliberately by the user).

## 7. Extension popup: shared CartPushSection component

- [x] 7.1 Create `packages/browser-extension/src/js/popup/cart-push/CartPushSection.jsx` — a shared React component that takes `{ store, isCurrent }` and reads `cartPushRun` + `bandcampCartPushBatchSize` from storage on mount, subscribing to `storage.onChanged`.
- [x] 7.2 Render the **start UI** (cart picker + push button) only when `isCurrent && (no run, or run for the other store in a terminal state already dismissed)`. Use `cart-push:list-fomo-carts` to populate the picker. The push button label is `Push to Beatport cart "FOMO: <name>"` (for Beatport) or `Open <N> tabs to push to Bandcamp` (for Bandcamp).
  - Implementation note: button label uses the generic Bandcamp wording ("Open tabs to push to Bandcamp") rather than pre-resolving N. Lazy-resolve-after-click avoids an extra round-trip to the backend just for the count; the resolved batch sizes are visible in the run UI as soon as the run starts.
- [x] 7.3 When a run exists *for this store* (any status), render the run-state block regardless of `isCurrent`:
  - `running` (Beatport): `Pushing "FOMO: <name>" — X / Y` progress line.
  - `awaiting-next-batch` (Bandcamp): `Batch <i+1> / <n> open (<m> tabs)` plus an `Open next batch` button that sends `cart-push:open-next-batch`.
  - `completed`: the summary block (buckets + counts + [show] expanders + Copy / Download / Dismiss buttons).
  - `failed`: the failure summary (top-level error + Dismiss).
- [x] 7.4 When a run exists for the *other* store, render a disabled push button on this panel with a hint identifying the in-flight store (e.g., "A Beatport push is in progress — wait or dismiss it before starting another").
- [x] 7.5 Implement `Copy skipped+failed`: build text (`<Artist> — <Title>` per line, failed lines append ` (status: <s>, error: <e>)`), call `navigator.clipboard.writeText`.
- [x] 7.6 Implement `Download as text`: build the full summary text (all four buckets + metadata header), make a `Blob`, `URL.createObjectURL`, click a temporary `<a download="fomo-push-<store>-<cart-slug>-<YYYYMMDD-HHMM>.txt">`.
- [x] 7.7 Implement `Dismiss`: send `cart-push:dismiss` to the service worker.

## 8. Extension popup: wire the component into BeatportPanel and BandcampPanel

- [x] 8.1 Render `<CartPushSection store="beatport" isCurrent={isCurrent} />` inside `BeatportPanel.jsx` under the existing "Send tracks" / "Sync" sections.
- [x] 8.2 Render `<CartPushSection store="bandcamp" isCurrent={isCurrent} />` inside `BandcampPanel.jsx` under the existing "Sync" section.

## 9. Extension options: Bandcamp batch size field

- [x] 9.1 Add the `Bandcamp cart-push batch size` field to `options.html`: number input, `min="1"`, `step="1"`, blank-allowed, with the documented help text below it.
  - Implementation note: the Options page is a React `Root.jsx` (not a static `options.html` + `options.js`). The field is added inside the existing "Bandcamp" `<fieldset>` with the same `min="1"` / `step="1"` constraints and the documented help copy.
- [x] 9.2 In `options.js`, on load read `browser.storage.local.bandcampCartPushBatchSize` and populate the field (blank if `null`/missing — and if missing for a new install, treat the in-memory state as `10` and write `10` on first save).
- [x] 9.3 On save, validate: blank → write `null`; positive integer → write the number; anything else → revert the input to the last valid value, render an inline error explaining the constraint, do not write to storage.

## 10. Tests and manual verification

- [x] 10.1 Run the existing test suite (`yarn test` in `packages/browser-extension/` and `packages/back/`) — ensure no regressions.
  - Result: extension `yarn test` → 77 passing (66 pre-existing + 11 new cart-push tests covering the resolver, Beatport flow scenarios a-f, partitioning, and Bandcamp run-state advance). Backend test run skipped — this change has no backend code modifications (task 1 finding); the existing `track_details` SQL function already exposes `stores[].trackId` and `stores[].url`.
  - Also: ran `BROWSER=chrome FRONTEND_URL=https://test.example node utils/build.js` to verify the new modules wire into the webpack build cleanly — compiled successfully.
- [ ] 10.2 Manual: Bandcamp run with `batchSize: 2` against a fomoplayer cart of 4 Bandcamp-resolvable tracks — verify two batches of two, `Open next batch` works, summary shows `Tabs opened: 4`.
- [ ] 10.3 Manual: Bandcamp run with `batchSize: null` against the same cart — verify all four tabs open at once and `status` flips straight to `completed`.
- [ ] 10.4 Manual: Beatport run against a real account — verify the `FOMO: <name>` cart appears on beatport.com, items land in it, the summary buckets match what actually happened. Re-run the same fomoplayer cart unchanged → verify everything lands in `Already in cart`, `Added: 0`.
- [ ] 10.5 Manual: log out of Beatport in the browser, try a Beatport run — verify the run terminates `failed` with "Not logged in to Beatport" before any other request fires.
- [ ] 10.6 Manual: with a Beatport run mid-loop, close the popup and re-open it — verify the popup re-attaches to the in-flight run. With a Bandcamp run in `awaiting-next-batch`, close + re-open the popup — verify the `Open next batch` button still works.

> **Note on 10.2–10.6**: these are user-driven manual verifications against real Beatport / Bandcamp accounts and a live extension load — they require a logged-in browser session and cannot be executed from the implementing agent. They are intentionally left unchecked here so the user/QA can tick them off during real-world acceptance.

## 11. Documentation

- [x] 11.1 Add a short section to `packages/browser-extension/README.md` documenting the new feature, the Options-page setting, and the v1 limitations (rename creates new Beatport cart, no remove sync, etc.).
