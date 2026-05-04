## 1. Drop the wrap's left-margin shim

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/inject.js`, edit `buttonContainer()` so the inline `cssText` no longer includes `margin-left: 8px`. Keep `display: inline-flex; gap: 6px; vertical-align: middle;` so the button trio still spaces and aligns correctly.

## 2. Anchor per-row injection on .time

- [x] 2.1 Inside the per-row loop in `injectReleaseLevelButtons`, find the row's `.time` span (`row.querySelector('.time')`). When present, use `time.insertAdjacentElement('afterend', wrap)` instead of `trackTitleCell.appendChild(wrap)`.
- [x] 2.2 Keep the existing `trackTitleCell.appendChild(wrap)` call as a fallback for rows that have no `.time` span — the cell lookup above already gates the row, so the fallback is "no `.time` element found".
- [x] 2.3 Confirm the per-row idempotency guard (`row.querySelector('[data-fp-injected]')`) still gates re-entry — the wrap is still a descendant of the row regardless of whether it sits after `.time` or inside `.track-title`.

## 3. Manual verification

- [ ] 3.1 Build the extension (`yarn build:chrome`) and reload the unpacked extension. _(build verified; live browser reload pending the user)_
- [ ] 3.2 On a multi-track Bandcamp release page, open dev tools and verify each track row shows `<span class="time">…</span><span data-fp-injected="1">…</span>` as siblings, with no `margin-left` on the injected span.
- [ ] 3.3 Confirm the Play / Queue / Add buttons sit visually adjacent to `.time` on each row, with no horizontal jump or wrap on rows of varying width.
- [ ] 3.4 Trigger a DOM mutation (scroll the player into view, expand a section) and confirm no duplicate `[data-fp-injected]` wraps appear on any row.
- [ ] 3.5 If you can find a release with a row that has no `.time` span, confirm the wrap still mounts inside the title cell rather than disappearing.

## 4. Wrap-up

- [x] 4.1 Run `openspec validate bandcamp-row-buttons-after-time --strict`.
- [x] 4.2 Update `backlog/items/004-bandcamp-injected-controls-alignment/notes.md` with a session-log entry summarising the change.
- [x] 4.3 Commit (single commit covering inject.js + the openspec change directory + backlog updates) and move backlog item 004 to **Done** in `backlog/INDEX.md`.
