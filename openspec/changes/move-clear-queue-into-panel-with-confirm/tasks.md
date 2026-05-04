## 1. Restructure the queue panel markup

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/player-ui.js`, replace the single `<div class="queue hidden" data-q>` element with a wrapper `<div class="queue-panel hidden" data-queue-panel>` containing a list `<div class="qlist" data-q></div>` and a `<button class="qclear" data-queue-clear>Clear queue</button>` sibling.
- [x] 1.2 Add styles for `.queue-panel`, `.qlist`, and `.qclear` in the existing `STYLE` block. Move the `.queue.hidden { display: none }` rule onto `.queue-panel.hidden`. Make `.qclear` visually distinct (e.g. the existing dark-mode button look) and full-width or right-aligned inside the panel footer.

## 2. Update refs, toggle wiring, and panel visibility

- [x] 2.1 Update `refs` in `ensureHost` to add `queuePanel` (the wrapper) and `queueClear` (the new button), keeping `refs.queue` pointing at the inner list (`[data-q]`) so `rebuildQueue` keeps working.
- [x] 2.2 Change the queue-toggle click handler to toggle the `hidden` class on `refs.queuePanel` instead of `refs.queue`.
- [x] 2.3 Change `syncQueueToggleLabel` to read `refs.queuePanel.classList.contains('hidden')`.
- [x] 2.4 In `renderEmptyState`, hide `refs.queuePanel` (not `refs.queue`).

## 3. Remove the old clear-queue icon button

- [x] 3.1 Delete the `<button class="t" data-clear ...>` element from the player controls row markup.
- [x] 3.2 Remove the `clear` ref from `refs` and the `refs.clear.addEventListener('click', ...)` binding.

## 4. Wire the new clear-queue button with confirmation

- [x] 4.1 In `bindEvents`, attach a click handler to `refs.queueClear` that calls `window.confirm('Clear the queue? This cannot be undone.')` and only sends `audio:clear` to the worker if the user confirms.

## 5. Verify

- [x] 5.1 `yarn test` passes in `packages/browser-extension/`.
- [x] 5.2 `FRONTEND_URL=https://example.test yarn build:chrome` succeeds.
- [ ] 5.3 Manually verify on a Bandcamp page: the player row no longer has the X button; opening the queue shows a "Clear queue" button inside the panel; clicking it shows a confirmation prompt; cancelling leaves the queue intact; confirming empties the queue; rebuilding the queue (e.g. adding a track) does not remove the clear button.
