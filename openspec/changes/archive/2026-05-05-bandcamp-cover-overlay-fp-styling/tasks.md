## 1. Add a `variant` argument to `cueButton`

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/inject.js`, extend `cueButton({ onClick, label, variant = 'default' })` so the button element carries a `data-variant="<variant>"` attribute.
- [x] 1.2 In the same shadow `<style>` block, add an overlay palette rule set scoped to `button[data-variant="overlay"]`: idle `background: #b40089; color: #fff; border-color: #530059`, hover `background: #9f0076`, error and loading states inherit the existing rules but tint matching the magenta palette where colour is mentioned (only override `border-color`/`background`/`color` for `data-variant="overlay"`). Keep the spinner colour aware of the variant — pass `'#fff'` to `spinnerHTML` when variant is `'overlay'`, `'#0687f5'` otherwise.

## 2. Add a `variant` argument to `renderCartButton`

- [x] 2.1 In `packages/browser-extension/src/js/content/bandcamp/cart-button.js`, extend `renderCartButton({ getReleases, label, variant = 'default' })` so the toggle button carries `data-variant="<variant>"` and the popup itself stays unchanged.
- [x] 2.2 In the shadow `STYLE` block, add a `button.toggle[data-variant="overlay"]` rule set: idle `background: #b40089; color: #fff; border-color: #530059`, hover `background: #9f0076`. Leave the popup's row colours untouched — only the toggle button is restyled per variant.

## 3. Wire the overlay variant into the cover-overlay injection sites

- [x] 3.1 In `injectDiscographyButtons`, pass `variant: 'overlay'` to each `cueButton(...)` call and pass `variant: 'overlay', label: 'Fomo'` to the `renderCartButton(...)` call.
- [x] 3.2 In `injectFeedButtons`, do the same — feed entries also overlay cover art and need the same treatment.
- [x] 3.3 In both injectors, extend the wrap's inline `cssText` with the overlay backdrop: `background: rgba(0, 0, 0, 0.55); border-radius: 6px; padding: 4px 6px;`. Mount the wrap as before (`position: absolute; top: 6px; right: 6px; z-index: 5;`). _(Pulled into a shared `OVERLAY_WRAP_CSS` constant so both injectors stay in sync.)_
- [x] 3.4 Confirm the release-title and per-track-row injections still pass no `variant` and no backdrop styles, so they keep the Bandcamp-blue palette and the bare wrap they have today.

## 4. Manual verification

- [ ] 4.1 Build (`yarn build:chrome`) and reload the extension. _(build verified; live reload pending the user)_
- [ ] 4.2 On a Bandcamp `/music` discography page, confirm each cover overlay shows Play, Queue, and a cart-icon-plus-"Fomo" trio with the magenta palette and a semi-transparent dark pill behind them.
- [ ] 4.3 On a release page (album or single track), confirm the title-section trio and per-track-row trio are still on Bandcamp blue with the original "Add release to Fomo Player" / "Add to Fomo Player" labels and no backdrop.
- [ ] 4.4 On `bandcamp.com/<user>/feed`, confirm the feed entries carry the new overlay styling consistent with the discography page.
- [ ] 4.5 Hover each overlay button and confirm the hover state flips to `#9f0076`.
- [ ] 4.6 Confirm the buttons still align horizontally (item 018) and the row's pill-backdrop fits the trio without clipping.

## 5. Wrap-up

- [x] 5.1 Run `openspec validate bandcamp-cover-overlay-fp-styling --strict`.
- [x] 5.2 Update `backlog/items/016-bandcamp-cover-overlay-button-styling/notes.md` with a session-log entry.
- [x] 5.3 Commit (single commit covering inject.js + cart-button.js + the openspec change directory + backlog updates) and move backlog item 016 to **Done** in `backlog/INDEX.md`.
