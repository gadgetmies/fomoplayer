## 1. Ship the shared theme module

- [x] 1.1 Create `packages/shared/theme.js` exporting a `colors`
      object with `brandPrimary`, `brandPrimaryHover`,
      `brandPrimaryBorder`, `brandPrimaryActive`,
      `brandPrimaryDisabled`, `brandPrimaryDisabledBorder`, and
      `brandPrimaryActiveRing`. Use plain CommonJS so it loads
      without Babel transpilation.
- [x] 1.2 Create `packages/shared/theme.css` declaring the same
      values as `:root` custom properties under the `--fp-` prefix.
- [x] 1.3 Add a header comment to each file naming the other so the
      palette files stay in sync.

## 2. Upgrade extension popup buttons

- [x] 2.1 Add `@import 'fomoplayer_shared/theme.css';` to
      `packages/browser-extension/src/css/shared.css`. (Verified at
      build time: webpack's css-loader resolves the bare specifier
      via the workspace's hoisted `node_modules`.)
- [x] 2.2 Rewrite the `button` / `button:disabled` rules in
      `shared.css` to use `var(--fp-brand-primary)`,
      `var(--fp-brand-primary-border)`,
      `var(--fp-brand-primary-hover)`,
      `var(--fp-brand-primary-disabled)`,
      `var(--fp-brand-primary-disabled-border)`, and the
      `var(--fp-brand-primary-active-ring)` focus-ring shadow,
      mirroring `front/src/buttons.css`'s
      `button-push_button-primary` cluster (border + hover + active
      ring).
- [x] 2.3 Replace the checkbox `:before` `#b40089` with
      `var(--fp-brand-primary)`.
- [x] 2.4 In `packages/browser-extension/src/js/popup/Status.jsx`,
      import `colors` from `fomoplayer_shared/theme` and pass
      `colors.brandPrimary` as the `Progress` `barColor` prop.

## 3. Move shadow-DOM injections onto the JS token

- [x] 3.1 In `packages/browser-extension/src/js/content/bandcamp/cart-button.js`,
      import `colors` from `fomoplayer_shared/theme` and replace
      every `#b40089` literal in the `STYLE` template with
      `${colors.brandPrimary}`.
- [x] 3.2 In `packages/browser-extension/src/js/content/bandcamp/inject.js`,
      do the same: replace the brand-primary literal with
      `${colors.brandPrimary}` in the cue button's `<style>` block
      while preserving the cover-overlay treatment (transparent
      fill, brand border, brand-fill hover).
- [x] 3.3 Re-skin the embedded player UI
      (`packages/browser-extension/src/js/content/bandcamp/player-ui.js`):
      replace the legacy cyan accent (`#1da0c3` Play fill /
      progress-fill / pending-spinner, `#2bb1d4` Play hover) and
      the teal-tinted active row (`#20323a`) with
      `colors.brandPrimary`, `colors.brandPrimaryHover`, and
      `colors.brandPrimaryActiveTint` respectively. Add the
      `brandPrimaryActiveTint` token to `theme.js` /
      `shared/theme.css` / `front/src/theme.css` if not already
      present.
- [x] 3.4 Grep `packages/browser-extension/src/` for `#b40089` /
      `rgb(180, 0, 137)` / `#1da0c3` / `#2bb1d4` / `#20323a` and
      confirm no literal remains. (Verified empty.)

## 4. Front-end token swap

- [x] 4.1 Create `packages/front/src/theme.css` mirroring the
      shared `:root --fp-...` block, with a header comment naming
      `packages/shared/theme.js` as the canonical source. CRA's
      `ModuleScopePlugin` blocks `@import` of CSS whose realpath
      is outside `src/`, so the front-end can't reach
      `fomoplayer_shared/theme.css` directly.
- [x] 4.2 `@import './theme.css';` near the top of
      `packages/front/src/App.css` (after the existing imports so
      it's available to every imported stylesheet).
- [x] 4.3 Replace `#b40089` in `packages/front/src/buttons.css`,
      `Tracks.css`, `Select.css`, `ToggleButton.css`,
      `Preview.css` with `var(--fp-brand-primary)`. Replace
      `#9f0076` with `var(--fp-brand-primary-hover)`, `#530059`
      with `var(--fp-brand-primary-border)`, `#6e0069` with
      `var(--fp-brand-primary-active)`, `#b5b5b5` with
      `var(--fp-brand-primary-disabled)`, `#7c7c7c` with
      `var(--fp-brand-primary-disabled-border)`, and the
      `rgba(180, 0, 137, 0.25)` ring with
      `var(--fp-brand-primary-active-ring)`.
- [x] 4.4 Replace the `input[type=range]` gradient's
      `rgb(180, 0, 137)` with `var(--fp-brand-primary)` in
      `App.css`.
- [x] 4.5 In `packages/front/src/Preview.js`, swap the literal
      `barColor="#b40089"` for `colors.brandPrimary` from
      `fomoplayer_shared/theme`.
- [x] 4.6 Grep `packages/front/src/` for `#b40089` /
      `rgb(180, 0, 137)` and confirm no literal remains. (Verified
      empty.)

## 5. Build and verify

- [x] 5.1 Run the browser-extension build (`yarn workspace
      fomoplayer_browser_extension build:chrome`) and confirm it
      succeeds without warnings or new errors. (Verified —
      webpack 5.104.1 compiled successfully; mocha tests pass.)
- [x] 5.2 Run the front-end production build (`yarn workspace
      fomoplayer_front build`) and confirm it compiles. (First
      pass failed against `ModuleScopePlugin`; switched to the
      in-`src/` mirror at task 4.1; second pass succeeded.)
- [x] 5.3 Ask the user to load the rebuilt extension and verify
      side-by-side with the FP web UI that the popup buttons
      match (idle fill, border, hover, active focus ring,
      disabled greys), the embedded player's Play button +
      progress bar + active queue row + pending spinner all read
      as FP magenta, and that the Bandcamp injected button trio
      looks identical to before (no regression on cover-overlay
      surfaces). (User confirmed "verified" 2026-05-05.)

## 6. Wrap up

- [x] 6.1 After explicit user verification, commit the change with
      all relevant files (shared theme, popup CSS, extension
      content scripts, popup Status, embedded player UI, front-end
      CSS / Preview.js, OpenSpec change).
- [x] 6.2 Archive the OpenSpec change via `/opsx:archive`.
- [x] 6.3 Move backlog item 013 from "Todo" into "Done" in
      `backlog/INDEX.md` and flip its frontmatter `status` to
      `done`.
