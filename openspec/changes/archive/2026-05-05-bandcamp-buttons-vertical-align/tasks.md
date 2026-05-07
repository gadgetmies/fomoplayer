## 1. Centre the inline-flex wrap

- [x] 1.1 In `packages/browser-extension/src/js/content/bandcamp/inject.js`, edit `buttonContainer()` so the wrap's inline `cssText` includes `align-items: center` alongside the existing `display: inline-flex; gap: 6px; vertical-align: middle;`. This ensures the shadow hosts inside the wrap share a single vertical centre line regardless of intrinsic content differences.

## 2. Centre each cue button's shadow host

- [x] 2.1 In `cueButton()` (same file), change the `:host` rule from `display: inline-block` to `display: inline-flex; align-items: center`. The host stops contributing a text-baseline that drifts away from the wrap's centre line.

## 3. Centre the cart-button shadow host and its SVG

- [x] 3.1 In `packages/browser-extension/src/js/content/bandcamp/cart-button.js`, edit the `:host` rule from `display: inline-block` to `display: inline-flex; align-items: center`.
- [x] 3.2 Add `display: block` (and an explicit `vertical-align: middle` for older renderers) to the existing `svg { width: 11px; height: 11px; fill: currentColor; }` rule so the cart icon's baseline contribution is removed and the button's vertical centre matches the cue-button siblings.

## 4. Manual verification

- [ ] 4.1 Build (`yarn build:chrome`) and reload the unpacked extension. _(build verified; live reload pending the user)_
- [ ] 4.2 On a multi-track Bandcamp release page, eyeball Play, Queue, and Add to Fomo Player on a per-track row — confirm all three sit on the same vertical centre line.
- [ ] 4.3 Repeat for the release-title section (Play release / Queue release / Add release to Fomo Player).
- [ ] 4.4 On a discography page, eyeball each cover-overlay trio — confirm all three sit on the same vertical centre line.
- [ ] 4.5 Use dev tools to measure each button's bounding-rect centre Y and confirm they agree within 1px.

## 5. Wrap-up

- [x] 5.1 Run `openspec validate bandcamp-buttons-vertical-align --strict`.
- [x] 5.2 Update `backlog/items/018-bandcamp-button-vertical-alignment/notes.md` with a session-log entry.
- [x] 5.3 Commit (single commit covering inject.js + cart-button.js + the openspec change directory + backlog updates) and move backlog item 018 to **Done** in `backlog/INDEX.md`.
