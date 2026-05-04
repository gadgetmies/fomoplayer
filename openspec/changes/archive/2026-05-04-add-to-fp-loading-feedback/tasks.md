## 1. Cart-button state machine plumbing

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/cart-button.js`, add `CHECK_ICON` and `WARN_ICON` SVG constants alongside the existing `CART_ICON` / `PLUS_ICON` for success / error states. Do **not** invent a spinner SVG — port the frontend's CSS spinner (next step) instead.
- [x] 1.2 Copy the `.loading-indicator` / `.loading-indicator__small` rules and the `lds-ring` `@keyframes` block from `packages/front/src/SpinnerButton.css` into the inline `STYLE` block in `cart-button.js` verbatim (omit `loading-indicator__large` — unused here). Add a small `spinnerHTML(color)` helper in `cart-button.js` that returns the same 4-`<div>` markup as `packages/front/src/Spinner.js` renders, with inline `border-color: <color> transparent transparent transparent` per child. Then add the `.row[data-state="loading"]`, `.row[data-state="success"]`, `.row[data-state="error"]` rules (and matching `button[data-create][data-state="…"]` rules) plus a `.row .row-error` inline error-message style.
- [x] 1.3 Inside `renderCartButton`, allocate a per-render `pending = new Set()` to guard re-entry for cart rows (keyed by cart id) and the create button (key `'__create__'`).
- [x] 1.4 Add a small `withTimeout(promise, ms)` helper (15 s default) that resolves to `{ ok: false, error: 'Request timed out' }` when the worker response does not arrive in time, and use it to wrap the `sendToWorker(...)` calls in this file.

## 2. Add-to-cart row feedback

- [x] 2.1 Refactor the `loadCarts()` row builder so each row is created via a small helper that returns the row element with a `setRowState(state, errorText?)` method on it (idle / loading / success / error). The helper swaps the leading icon (cart icon / `spinnerHTML('#0687f5')` / check / warn), toggles the muted-text class, and attaches or removes the `.row-error` element under the row text.
- [x] 2.2 Replace the existing row click handler with one that: (a) returns early if the row's cart id is in `pending`; (b) adds it to `pending` and calls `setRowState('loading')`; (c) awaits `withTimeout(sendToWorker({ type: 'bandcamp:add-to-cart', cartId, releases }))`; (d) on `ok`, calls `setRowState('success')`, then after ~900 ms calls `closeOpen()`; (e) on failure, calls `setRowState('error', result?.error || 'Failed to add to cart')` and leaves the popup open; (f) removes the cart id from `pending` in both branches.
- [x] 2.3 Make a click on an `error`-state row reset that row to `idle` (clearing the inline error) before re-running the add flow, so retry is one click.
- [x] 2.4 Remove the now-redundant 4-second `setStatus` success line for the add path; keep `setStatus` only for popup-level errors that have no row (e.g. `loadCarts` failure).

## 3. Create-and-add `+` button feedback

- [x] 3.1 Reuse the same `setRowState`-style state machine on the `[data-create]` button: `idle` shows `PLUS_ICON`, `loading` shows the spinner and disables the button, `success` shows `CHECK_ICON`, `error` shows `WARN_ICON`. (Implementation note: spinner colour is `#222` to match the dark icon on the popup's white background — the original `'#fff'` choice in this task assumed an accent fill that does not actually exist on the create button.)
- [x] 3.2 Refactor the create handler to: guard on `pending.has('__create__')`; flip to `loading`; await `withTimeout(sendToWorker({ type: 'bandcamp:create-cart', name }))`; on failure flip to `error`, surface the error via `setStatus` and inline next to the button, leave the input value intact, return; on success await the follow-up `bandcamp:add-to-cart` (also wrapped in `withTimeout`); on combined success flip to `success` and `closeOpen()` after the ~900 ms; on add-failure flip to `error` and surface "Created cart but add failed" inline.
- [x] 3.3 In all branches, ensure `pending.delete('__create__')` runs before returning.

## 4. Remove-from-cart shared lifecycle (item 009 hook)

- [x] 4.1 Document in the row helper from 2.1 that "remove" rows (added by item 009) reuse the same `setRowState` and `pending` guard, so item 009's only delta is to wire `bandcamp:remove-from-cart` into the click handler and adjust the success microcopy / membership refresh — no new state-machine code is needed there.
- [x] 4.2 Confirm via grep that no other call site of `cart-button.js` would need updating when item 009 lands; capture the result inline as a one-line code comment if the wiring is non-obvious. (Verified: only `inject.js` imports the module; noted at the top of `cart-button.js`.)

## 5. Manual verification

- [x] 5.1 Build the extension (`pnpm --filter browser-extension build`) and load the unpacked build.
- [x] 5.2 On a Bandcamp release page, open the "Add to Fomo Player" dropdown for a track, click a cart row, and confirm: spinner appears immediately on that row, success indication appears briefly, then the dropdown closes, and the track is in the cart.
- [x] 5.3 Repeat against a cart whose add is forced to fail (e.g. by temporarily toggling the network offline before clicking) and confirm: the row shows the error indication with the worker's message inline, the popup stays open, and a second click on the same row retries.
- [x] 5.4 Click the same cart row twice in rapid succession and confirm only one `bandcamp:add-to-cart` request is issued (Network tab) and the row reaches a single resolved state.
- [x] 5.5 Click two different cart rows back-to-back and confirm each row spins independently.
- [x] 5.6 Type a new cart name, click the `+` button, and confirm the create path shows the spinner, success indication, and dropdown close. Then repeat with the network offline to confirm the error case keeps the popup open with the input value preserved.
- [x] 5.7 With the worker artificially blocked (e.g. add a `await new Promise(() => {})` in the `bandcamp:add-to-cart` handler temporarily), confirm the row reaches the timeout error state after ~15 s and is retryable. Revert the worker change.

## 6. Wrap-up

- [x] 6.1 Run `openspec validate add-to-fp-loading-feedback`.
- [x] 6.2 Update `backlog/items/010-add-to-fp-loading-feedback/README.md` status to `in-progress` (or move to `done` after the user verifies).
