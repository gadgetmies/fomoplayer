# Fomo Player theme tokens

## Purpose

Single source of truth for the Fomo Player brand-primary palette and
how it propagates to every consumer (extension popup, extension
content scripts and embedded player UI, the front-end web UI). Lets a
palette tweak ripple to one place rather than a dozen hex literals.

## Requirements

### Requirement: Shared theme module exports the brand-primary palette

The `fomoplayer_shared` package SHALL ship a JavaScript theme module
(`fomoplayer_shared/theme.js`) that exports a `colors` object whose
own enumerable string keys cover the Fomo Player brand-primary
palette. The exported keys MUST include at least:

- `brandPrimary` — `#b40089`
- `brandPrimaryHover` — `#9f0076`
- `brandPrimaryBorder` — `#530059`
- `brandPrimaryActive` — `#6e0069`
- `brandPrimaryDisabled` — `#b5b5b5`
- `brandPrimaryDisabledBorder` — `#7c7c7c`
- `brandPrimaryActiveRing` — `rgba(180, 0, 137, 0.25)`
- `brandPrimaryActiveTint` — `rgba(180, 0, 137, 0.18)`

The module MUST be loadable from both the browser-extension build
(under `node_modules` via the workspace link, even though
`babel-loader` excludes `node_modules`) and the front-end build
without any new transpilation step.

#### Scenario: Brand primary keys exist with the documented values

- **WHEN** a consumer imports `colors` from `fomoplayer_shared/theme.js`
- **THEN** the imported object's `brandPrimary`, `brandPrimaryHover`,
  `brandPrimaryBorder`, `brandPrimaryActive`,
  `brandPrimaryDisabled`, `brandPrimaryDisabledBorder`,
  `brandPrimaryActiveRing`, and `brandPrimaryActiveTint` strings
  equal the values listed above.

#### Scenario: Module loads without Babel transpilation

- **WHEN** the extension's webpack pipeline (which excludes
  `node_modules` from `babel-loader`) bundles
  `fomoplayer_shared/theme.js`
- **THEN** the build succeeds without syntax errors and the
  resulting bundle contains the literal hex values from the module.

### Requirement: CSS pipelines consume the brand-primary palette as :root custom properties

Every CSS pipeline that needs the brand-primary palette SHALL expose
the same `:root` custom properties under the `--fp-` prefix:

- `--fp-brand-primary`
- `--fp-brand-primary-hover`
- `--fp-brand-primary-border`
- `--fp-brand-primary-active`
- `--fp-brand-primary-disabled`
- `--fp-brand-primary-disabled-border`
- `--fp-brand-primary-active-ring`
- `--fp-brand-primary-active-tint`

The browser-extension popup MUST source these from
`fomoplayer_shared/theme.css` directly (its webpack pipeline resolves
bare specifiers via the workspace's hoisted `node_modules`). The
front-end MUST source these from `packages/front/src/theme.css`, a
thin local mirror that re-declares the same property names and
values because Create React App's `ModuleScopePlugin` rejects
`@import`s whose realpath is outside `src/`. The local mirror file
MUST carry a header comment naming `packages/shared/theme.js` as the
canonical source.

#### Scenario: Extension popup CSS imports the shared file directly

- **WHEN** the extension popup's `shared.css` `@import`s
  `fomoplayer_shared/theme.css`
- **THEN** the popup's `:root` exposes the eight `--fp-...` custom
  properties with the values from the shared module.

#### Scenario: Front-end CSS imports the in-src mirror

- **WHEN** `packages/front/src/App.css` `@import`s `./theme.css`
- **THEN** the front-end's `:root` exposes the eight `--fp-...`
  custom properties with values that match the canonical
  `packages/shared/theme.js` colours, and the production CRA build
  succeeds without `ModuleScopePlugin` errors.

### Requirement: Palette files stay in sync

The three palette files SHALL hold the same set of brand-primary
values. Each file MUST carry a header comment naming the others so a
future palette tweak updates all three. Tooling MAY compare them at
build time; this requirement does not mandate a check, only the
documentation hook.

#### Scenario: Header comments cross-reference the siblings

- **WHEN** a contributor reads `packages/shared/theme.js`,
  `packages/shared/theme.css`, or `packages/front/src/theme.css`
- **THEN** the file's header comment names the other two files and
  the brand-primary keys / property names so the contributor knows
  to update all three when changing the palette.

### Requirement: Browser-extension popup buttons match the FP primary button

The browser extension popup's `<button>` element styling
(`packages/browser-extension/src/css/shared.css`) SHALL render with
the same idle, hover, disabled, and active states as the Fomo Player
front-end's `button-push_button-primary` block (less its decorative
`:before` element). All four states MUST source their colours from
the shared theme tokens.

#### Scenario: Idle button uses the brand fill, brand border, white text

- **WHEN** the popup renders an enabled `<button>` in its idle state
- **THEN** the button's background is `var(--fp-brand-primary)`, its
  border is 1px solid `var(--fp-brand-primary-border)`, and its
  colour is `#fff` (or any equivalent token-defined "on-brand"
  value).

#### Scenario: Hover state uses the hover fill

- **WHEN** the user hovers an enabled popup button
- **THEN** the background transitions to
  `var(--fp-brand-primary-hover)` while the text stays white.

#### Scenario: Active button shows a brand-tinted focus ring

- **WHEN** the user clicks (`:active`) or focuses (`:focus-visible`)
  a popup button
- **THEN** the button shows a 0.2rem outer ring whose colour is
  `var(--fp-brand-primary-active-ring)`.

#### Scenario: Disabled button uses the disabled greys

- **WHEN** the popup renders a `disabled` button
- **THEN** the background is `var(--fp-brand-primary-disabled)` and
  the border is 1px solid `var(--fp-brand-primary-disabled-border)`.

### Requirement: Extension consumers route brand-primary through tokens

Every browser-extension source file that today references the brand
hex literal `#b40089` (or its hover / border / active variants) for
button-related styling SHALL instead reference the shared theme
tokens — `var(--fp-...)` in CSS contexts, `colors.brandPrimary*` in
JS shadow-DOM string templates. The Bandcamp injection styles MAY
keep their cover-overlay treatment (transparent fill, brand border,
brand-fill hover, dark backdrop wrap) — only the colour value moves
behind the token.

#### Scenario: No `#b40089` literal remains in extension button code

- **WHEN** a contributor greps the
  `packages/browser-extension/src/` tree for `#b40089`
- **THEN** every match outside of the `fomoplayer_shared/theme.*`
  files is gone; matches against the literal exist only because they
  came in via the imported `colors.brandPrimary` token at runtime.

#### Scenario: Injected button still shows the cover-overlay treatment

- **WHEN** the extension renders the Play / Queue / Add-to-Fomo trio
  on any Bandcamp surface
- **THEN** the buttons render with a transparent fill, a 1px
  `colors.brandPrimary` border, white text, and a hover that fills
  the button with `colors.brandPrimary` — same shape as before, only
  the value source changed.

### Requirement: Embedded player UI uses brand tokens for its accent

The embedded sticky player rendered into Bandcamp pages
(`packages/browser-extension/src/js/content/bandcamp/player-ui.js`)
SHALL render its primary accent — the Play / Pause transport
button's fill, the progress-bar fill, the pending-row spinner, and
the active queue row's background tint — using the shared theme
tokens. The Play button MUST use `colors.brandPrimary` at idle and
`colors.brandPrimaryHover` on hover. The progress bar's filled
portion and the pending-row spinner colour MUST use
`colors.brandPrimary`. The active queue row's background tint MUST
use `colors.brandPrimaryActiveTint`. No `#1da0c3` / `#2bb1d4` /
`#20323a` literal SHALL remain in `player-ui.js`.

#### Scenario: Play button uses brand fill and brand hover

- **WHEN** the embedded player renders its central Play / Pause
  transport button at idle and the user hovers it
- **THEN** the idle background equals `colors.brandPrimary` and the
  hover background equals `colors.brandPrimaryHover`.

#### Scenario: Progress bar fill uses brand primary

- **WHEN** a track is playing and the embedded player renders its
  progress bar
- **THEN** the bar's filled portion (`.bar-fill`) is painted in
  `colors.brandPrimary`.

#### Scenario: Active queue row uses brand-tinted background

- **WHEN** the embedded player's queue panel renders the row
  matching the currently-active track index
- **THEN** that row's background equals
  `colors.brandPrimaryActiveTint`, distinct from the default
  hover-tinted greys used for non-active rows.

#### Scenario: Pending-add spinner uses brand primary

- **WHEN** the embedded player's queue panel shows the
  "Adding…" pending row while a queue add is in flight
- **THEN** the spinner's stroke colour equals
  `colors.brandPrimary`.

### Requirement: Front-end consumers route brand-primary through tokens

Every front-end CSS rule under `packages/front/src/` that today
references the brand hex literal `#b40089` SHALL instead reference
`var(--fp-brand-primary)` (or the appropriate hover / border /
active variant). Code-side colour props (e.g. `<Progress
barColor="#b40089" />` in `Preview.js`) MAY read the token from the
JS module so the value remains a single source of truth.

#### Scenario: No `#b40089` literal remains in front-end button code

- **WHEN** a contributor greps `packages/front/src/buttons.css`,
  `Tracks.css`, `Select.css`, `ToggleButton.css`, and the
  `App.css` `input[type=range]` rule for `#b40089` / `rgb(180, 0,
  137)`
- **THEN** the matches are gone; the rules read from
  `var(--fp-brand-primary)` (or the matching variant) instead.

#### Scenario: Importing the front-end mirror makes the variables available

- **WHEN** `packages/front/src/App.css` `@import`s `./theme.css`
- **THEN** every front-end rule that references `var(--fp-...)`
  resolves to the documented value at runtime, and the CRA build
  succeeds without `ModuleScopePlugin` errors.
