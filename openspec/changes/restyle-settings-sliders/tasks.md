## 1. Rewrite the slider CSS

- [x] 1.1 In `packages/front/src/App.css`, replace the existing
  `input[type='range']` rule so the input itself paints a transparent
  backdrop with a `var(--fp-brand-primary)` leading-portion gradient
  consumed at `2px` height (centred vertically via
  `background-position: center`), keeping
  `background-image: linear-gradient(var(--fp-brand-primary), var(--fp-brand-primary))`,
  `background-repeat: no-repeat`, and the existing transition so
  `Settings.js#renderWeightInputs` keeps driving the filled width via
  inline `backgroundSize`.
- [x] 1.2 Rewrite the `input[type='range']::-webkit-slider-thumb`
  rule: `14px × 14px`, `border-radius: 50%`,
  `background: var(--fp-brand-primary)`, `border: 2px solid #fff`,
  remove `box-shadow`, keep `cursor: ew-resize`.
- [x] 1.3 Rewrite the `input[type='range']::-webkit-slider-runnable-track`
  rule so the track itself is `2px` tall and transparent (the input's
  own background paints the visible hairline + fill).
- [x] 1.4 Add new `input[type='range']::-moz-range-track` and
  `::-moz-range-thumb` rules mirroring the WebKit ones so Firefox
  renders the same hairline + circular thumb.
- [x] 1.5 Audit `Settings.js#renderWeightInputs` and remove any inline
  style entries on the `<input type="range">` that would fight the
  new CSS contract (e.g. obsolete `height` or `background` overrides);
  keep the `backgroundSize` driver and the `display: 'table-cell'`
  layout.

## 2. Add the demo cascade-test

- [x] 2.1 Create `packages/back/test/browser/settings-slider.js`
  modelled on `packages/back/test/browser/settings.js`: import
  `cascade-test`, set up the shared context, navigate to `/settings`,
  wait for `.settings-container` and the first
  `input#weights-… [type="range"]` to render.
- [x] 2.2 In the test, capture the initial `value` of the first
  score-weight slider and the resolved `background-size` width via
  `page.evaluate(() => getComputedStyle(el).backgroundSize)`.
- [x] 2.3 Focus the slider and use `page.keyboard.press('ArrowRight')`
  in a loop (10+ presses) followed by a mouse drag so the recorded
  video shows visible thumb motion in both modes.
- [x] 2.4 Assert with `chai`'s `expect` that the slider's reported
  `value` differs from the initial value, AND that the resolved
  `background-size` width percentage differs from its initial value,
  satisfying both "filled-track follows value" and "demo proves the
  control works" scenarios.

## 3. Wire the test into the PR-demo workflow

- [ ] 3.1 Add a `demo-test` GitHub label to the PR opened from this
  branch (a maintainer applies it on the GitHub UI; document this in
  the PR body for re-discoverability).
- [ ] 3.2 Author the PR body so it includes the exact fenced block
  `\`\`\`demo-test\ntest/browser/settings-slider.js\n\`\`\``, matching
  the regex `.github/workflows/pr-demo.yml` parses
  (`/```demo-test\r?\n([\s\S]*?)```/`).
- [ ] 3.3 After the PR is opened and the workflow runs, verify a
  `demo-video-pr-<n>` artifact appears on the run page and that the
  workflow comments back with a link.

## 4. Verify

- [ ] 4.1 Run the front-end locally (`yarn workspace fomoplayer_front
  start`), open `/settings`, drag the score-weight sliders, and
  visually confirm the new hairline + circular thumb against the
  mockup; check both Chromium and Firefox.
- [ ] 4.2 Run the new cascade-test locally against a local back-end
  (`cd packages/back && npx cascade-test
  test/browser/settings-slider.js`) and confirm it passes.
- [ ] 4.3 `yarn workspace fomoplayer_front build` succeeds (CRA does
  not regress on the CSS rewrite).
- [x] 4.4 Run `openspec validate restyle-settings-sliders --strict`
  before requesting review.
