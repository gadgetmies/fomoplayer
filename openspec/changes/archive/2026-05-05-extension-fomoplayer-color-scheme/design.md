## Context

The Fomo Player brand-primary palette is currently hard-coded as hex
literals in two layers:

- **Front-end** (`packages/front/src/`): `buttons.css`, `Tracks.css`,
  `Preview.js` (`barColor="#b40089"`), `Select.css`, `ToggleButton.css`,
  and the `App.css` `input[type=range]` gradient.
- **Browser extension** (`packages/browser-extension/src/`):
  `css/shared.css` (popup buttons + checkbox), `js/popup/Status.jsx`
  (progress bar `barColor`), `js/content/bandcamp/cart-button.js`, and
  `js/content/bandcamp/inject.js` (per-row / release / discography /
  feed shadow-DOM buttons).

The extension already imports a workspace package
`fomoplayer_shared` (declared in its `package.json` and aliased into
`node_modules` by yarn workspaces) and the front does the same. We
can host the tokens there with no new dependency surface.

The injected button styles live inside per-element shadow roots — they
build their CSS as a template literal in JS, so they can't `@import` a
stylesheet without losing the encapsulation; they consume a JS module
exporting plain hex strings instead. The popup, in contrast, is a
regular HTML page with a normal CSS pipeline and benefits from
`var(--fp-...)` (so any future palette tweak ripples without
rebuilding string templates).

## Goals / Non-Goals

**Goals:**

- One source of truth for the FP brand-primary cluster, accessible
  from both CSS and JS contexts.
- The popup's primary buttons match the FP web UI's primary buttons
  side-by-side (idle fill, border, hover fill, disabled greys, active
  focus ring).
- The injected Bandcamp button trio keeps its current
  cover-overlay treatment (transparent + brand-coloured border, hover
  fills brand) but reads the brand colour from the token.
- No regression to existing visual behaviour or accessibility
  contrast.

**Non-Goals:**

- Pulling the rest of the front-end's hex palette (greys, status
  reds/greens, in-cart blue) into tokens. That's worth doing but is a
  separate, bigger cleanup.
- Restyling the embedded player UI's monochrome backdrop
  (`packages/browser-extension/src/js/content/bandcamp/player-ui.js`)
  beyond the brand colour where it appears.
- Adding a dark/light theme switch.
- Restructuring `fomoplayer_shared` (renaming to a scoped package,
  moving to TypeScript, etc.).

## Decisions

### Decision: Ship a shared `theme.js` + `theme.css` pair under `fomoplayer_shared`, plus a front-end mirror

**Rationale:** Front and extension both already depend on
`fomoplayer_shared`; adding two small files keeps the import paths
short (`fomoplayer_shared/theme.js`, `fomoplayer_shared/theme.css`)
and avoids spinning up a new workspace package. The JS module covers
shadow-DOM consumers; the CSS file covers the extension popup's
CSS pipeline.

The front-end needs a third file: `packages/front/src/theme.css`,
a thin mirror with the same `:root { --fp-... }` block. CRA's
`ModuleScopePlugin` (`react-scripts@5`) rejects `@import`s in CSS
whose realpath resolves outside `src/`, even when the import goes
through `node_modules` symlinks. The escape hatches (`craco`,
`react-app-rewired`, ejection) are too heavy for seven hex values.
The mirror file carries a header comment naming
`packages/shared/theme.js` as the canonical source so any future
palette tweak updates all three palette files in lockstep.

**Alternatives considered:**

- **Generate `theme.css` from `theme.js` at build time** — adds a
  build step for six values. Rejected as overkill; manual sync of two
  short files is fine.
- **JS-only and inject the `:root` block from JS at runtime** — works
  for the front-end but flashes pre-token colours during initial
  render and complicates the extension popup that already has a
  static stylesheet. Rejected.
- **A new workspace package** — adds boilerplate (`package.json`,
  `node_modules` link, lockfile churn). Rejected.

### Decision: Keep the injected Bandcamp button styling cover-overlay-friendly

**Rationale:** The injected buttons sit on Bandcamp pages whose
backgrounds vary (cover art, dark feed cards, white discography
tiles). Item 016 deliberately gave them transparent fills + brand
borders + brand-fill hovers + a `rgba(0,0,0,.55)` rounded backdrop
behind the wrap. That treatment is documented in the
`bandcamp-track-actions` capability's "unified palette" requirement
and stays unchanged here — only the brand colour value moves to the
token.

### Decision: Bring the popup buttons up to the front-end's primary-button treatment

**Rationale:** The popup is a Fomo Player surface, not an overlay;
it should read as the same product as the web UI. Today the popup's
plain `<button>` selector defines fill + colour + transition + radius
but no border, no hover state, no focus ring, and a different
disabled treatment. Mirroring `front/src/buttons.css`'s
`button-push_button-primary` block (less the pseudo-element shadow,
which is decorative) closes the gap without expanding the popup's
scope.

### Decision: Plain CommonJS for `theme.js`, no transpilation needed

**Rationale:** The extension's `babel-loader` excludes `node_modules`,
which is where `fomoplayer_shared` lives once yarn workspaces link it.
A `module.exports = { colors: { ... } }` form keeps the module usable
under any of the three browser builds (chrome, firefox, safari) and
under the front-end's CRA setup without needing `@babel/preset-env`
to chew through it.

## Risks / Trade-offs

- **Front-end build picks up the new CSS import path.** → Resolved
  during implementation: CRA's `ModuleScopePlugin` rejects
  `@import 'fomoplayer_shared/theme.css'` (and the `~`-prefixed
  variant) because the symlink's realpath is outside `src/`. The
  fix is the in-`src/` mirror documented above.
- **Three-file palette can drift.** → Mitigated by header comments in
  each of the three files naming the other two and listing the
  keys/property names side by side. Worst case is a missed colour
  during a future tweak; the affected component visibly regresses
  and we fix it.
- **Shadow-DOM string interpolation loses CSS variable semantics.** →
  By design — shadow roots can't read parent `:root` custom
  properties unless we explicitly host them. The JS-string approach
  is intentional and cheap.

## Migration Plan

Single-step replacement; no data migration. Roll out with the next
extension build and the next front-end deploy. Rollback = revert.

## Open Questions

_(none — the existing palette is well-defined; the only deliberate
choice is the token names, captured in the `fomoplayer-theme-tokens`
spec.)_
