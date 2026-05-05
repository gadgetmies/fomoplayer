## Why

Fomo Player's brand colour (`#b40089`) and its primary-button palette
already exist in the front-end (`packages/front/src/buttons.css`,
`Tracks.css`, `Preview.js`, `Select.css`, `ToggleButton.css`) and in the
browser extension (`packages/browser-extension/src/css/shared.css`,
`js/popup/Status.jsx`, the injected Bandcamp button styles). Each
consumer hard-codes the hex literal independently, so any palette
adjustment requires touching half a dozen files and the popup's
`<button>` styling has drifted from the front-end (no border, no
hover, no focus ring), making the popup feel like a different product
from the web UI it complements.

The fix is a single source of truth for the brand-primary token cluster
and bringing the popup buttons up to the FP web UI's primary-button
treatment using that source.

## What Changes

- Add a shared theme module at `packages/shared/theme.js` exporting a
  `colors` JS object (the canonical source — consumed from extension
  content scripts that build shadow-DOM `<style>` strings, and from
  front-end JS that needs a colour string prop) and a sibling
  `packages/shared/theme.css` declaring the same values as `:root`
  custom properties for the extension popup CSS. The front-end can't
  `@import` the shared CSS directly (CRA's `ModuleScopePlugin`
  rejects realpaths outside `src/`), so ship a thin
  `packages/front/src/theme.css` mirror with a header comment naming
  `packages/shared/theme.js` as the canonical source.
- Replace the brand-primary literals in
  `packages/browser-extension/src/css/shared.css` with `var(--fp-...)`
  references and add the missing FP-style border, hover-fill,
  disabled-border, and focus-ring rules so popup buttons match the
  web UI's primary-button look side-by-side.
- Replace brand-primary literals in
  `packages/browser-extension/src/js/popup/Status.jsx`,
  `packages/browser-extension/src/js/content/bandcamp/cart-button.js`,
  and `packages/browser-extension/src/js/content/bandcamp/inject.js`
  with imports from `fomoplayer_shared/theme.js`. The injected
  shadow-DOM buttons keep their cover-overlay treatment (transparent +
  border, hover-fills); only the colour values move to the token.
- Re-skin the embedded sticky player UI
  (`packages/browser-extension/src/js/content/bandcamp/player-ui.js`)
  so its accent — Play button fill, progress-bar fill, pending-row
  spinner, and active-queue-row tint — uses the shared brand tokens
  instead of the legacy cyan (`#1da0c3` / `#2bb1d4`) and the
  teal-tinted active-row background (`#20323a`). Add a
  `brandPrimaryActiveTint` token (`rgba(180, 0, 137, 0.18)`) to cover
  the subtle active-row tint use case.
- Replace brand-primary literals in
  `packages/front/src/buttons.css`, `Select.css`, `ToggleButton.css`,
  `Tracks.css`, and the `App.css` `input[type=range]` rule with
  `var(--fp-...)` references after `App.css` imports the shared
  `theme.css`.
- Leave non-brand status colours (success green, error red, in-cart
  blue, neutral greys) untouched. Pulling them into tokens is a
  separate cleanup.

## Capabilities

### New Capabilities

- `fomoplayer-theme-tokens`: A shared, single-source-of-truth palette
  of Fomo Player brand colours, exposed as both a JS module (for
  shadow-DOM string interpolation) and a CSS file (`:root` custom
  properties) so every consumer references the same values.

### Modified Capabilities

_(none — the existing `bandcamp-track-actions` `unified palette`
requirement keeps the same colour values; only the source moves
behind a token.)_

## Impact

- Affected code:
  - `packages/shared/theme.js` (new — canonical source),
    `packages/shared/theme.css` (new — for the extension popup),
    `packages/front/src/theme.css` (new — front-end mirror needed
    because CRA's `ModuleScopePlugin` blocks `@import`s of CSS
    files whose realpath is outside `src/`).
  - `packages/browser-extension/src/css/shared.css` (popup palette
    upgrade + tokens).
  - `packages/browser-extension/src/js/popup/Status.jsx` (token).
  - `packages/browser-extension/src/js/content/bandcamp/cart-button.js`
    and `.../bandcamp/inject.js` (tokens).
  - `packages/front/src/App.css` (import the shared CSS once).
  - `packages/front/src/buttons.css`, `Select.css`, `ToggleButton.css`,
    `Tracks.css`, `Preview.js` (`barColor` prop) — replace literals.
- No new runtime deps. The shared module is plain ES5 (so the
  extension's babel-loader's `node_modules` exclude doesn't break
  it).
- No backend or worker changes.
- Risk: a typo in the token swap could regress the visual palette.
  Mitigation: the build still passes any unrelated lint/tests; the
  user verifies the popup and a Bandcamp surface side-by-side with
  the web UI before commit.
