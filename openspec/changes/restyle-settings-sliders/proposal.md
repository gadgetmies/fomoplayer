## Why

The current settings-page sliders (the score-weight inputs rendered by
`renderWeightInputs` in `packages/front/src/Settings.js`) use a chunky
square-thumb / progress-bar look that is heavy, dated, and visually loud
relative to the rest of the settings UI. The desired look is a thin,
unobtrusive horizontal track with a small circular brand-coloured thumb,
matching the reference mockup the maintainer shared. Refreshing the
slider also gives us an opportunity to exercise the `demo-test` PR
workflow end-to-end so future visual-tweak PRs have a working template
for shipping a recorded demo alongside the change.

## What Changes

- Restyle `input[type='range']` in `packages/front/src/App.css` so the
  track renders as a thin dark line with a small circular thumb in
  `var(--fp-brand-primary)` ringed in white, matching the mockup.
- Cover the WebKit and Firefox (`::-moz-range-track`,
  `::-moz-range-thumb`) pseudo-elements so the new look ships in every
  browser the front-end targets.
- Keep the filled-portion treatment (left of the thumb tinted brand)
  driven by `background-size`, so the existing
  `Settings.js#renderWeightInputs` JSX continues to work without React
  changes — only the CSS contract changes.
- Add a new cascade-test browser test that loads `/settings`, locates a
  score-weight slider, drags its thumb, and asserts the value and
  filled-track width respond, producing a Playwright video and trace
  when run via the `demo-test` workflow.
- Document the demo-test wiring in the PR body: the PR will carry the
  `demo-test` label and embed a fenced ` ```demo-test ` block pointing
  at the new test file so `.github/workflows/pr-demo.yml` picks it up
  and uploads the recorded video as an artifact.

## Capabilities

### New Capabilities
- `settings-slider-style`: visual contract for the `input[type='range']`
  controls used on the settings page (track shape, thumb shape, brand
  colour sourcing, and cross-browser coverage).
- `pr-demo-test-workflow`: documents the contract the `pr-demo.yml`
  GitHub workflow expects from a PR (label + fenced ` ```demo-test `
  block in the body) and how a committed cascade-test file is wired up
  so the workflow produces the recorded video artifact.

### Modified Capabilities

_None. The shared theme tokens already expose `--fp-brand-primary`; this
change only consumes them in a new rule and does not change any spec-level
requirement of `fomoplayer-theme-tokens`._

## Impact

- `packages/front/src/App.css`: the `input[type='range']` block and its
  `::-webkit-slider-thumb` / `::-webkit-slider-runnable-track` rules
  rewritten; new `::-moz-range-track` / `::-moz-range-thumb` rules
  added.
- `packages/front/src/Settings.js`: inline styles on the
  `renderWeightInputs` `<input type="range">` audited so they do not
  fight the new CSS (the `backgroundSize` driver stays).
- `packages/back/test/browser/settings-slider.js`: new cascade-test
  file exercising a settings slider end-to-end.
- PR description: gains a ` ```demo-test ` fenced block pointing at
  `test/browser/settings-slider.js` and the `demo-test` label so the
  existing `pr-demo.yml` workflow runs it against the Railway preview.
- No backend, no database, no API surface changes.
