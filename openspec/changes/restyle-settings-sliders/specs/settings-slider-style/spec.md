## ADDED Requirements

### Requirement: Range inputs render as a hairline track with a circular brand thumb

Every `<input type="range">` rendered by the front-end SHALL paint as a
thin horizontal track at most `2px` tall, with the leading portion (from
the track's start to the thumb) filled in `var(--fp-brand-primary)` and
the trailing portion painted in a neutral dark stripe (or transparent on
top of a dark surface). The thumb MUST be a circle of `14px ± 2px`
diameter filled with `var(--fp-brand-primary)` and surrounded by a `2px`
solid white border. No square corners and no decorative drop shadow MUST
appear on the thumb. The styling MUST be driven by the global
`packages/front/src/App.css` `input[type='range']` rule and its
pseudo-element children so React/JSX call sites need no per-instance
overrides.

#### Scenario: WebKit track and thumb match the hairline + circular thumb contract

- **WHEN** Chrome, Edge, or Safari renders a settings-page score-weight
  slider
- **THEN** the slider's `::-webkit-slider-runnable-track` paints as a
  hairline `≤ 2px` tall, the leading portion equals
  `var(--fp-brand-primary)`, and the `::-webkit-slider-thumb` is a
  circle (`border-radius: 50%`) ≈ `14px` in diameter filled with
  `var(--fp-brand-primary)` and bordered by a `2px solid #fff` halo,
  with no `box-shadow` set.

#### Scenario: Gecko track and thumb match the hairline + circular thumb contract

- **WHEN** Firefox renders a settings-page score-weight slider
- **THEN** the slider's `::-moz-range-track` paints as a hairline
  `≤ 2px` tall, the leading portion equals `var(--fp-brand-primary)`,
  and the `::-moz-range-thumb` is a circle (`border-radius: 50%`)
  ≈ `14px` in diameter filled with `var(--fp-brand-primary)` and
  bordered by a `2px solid #fff` halo.

### Requirement: Filled-track portion follows the input value

The painted brand-primary leading portion of every restyled range input SHALL grow and shrink in proportion to the input's current value relative to its `min`/`max`, using the existing `background-size`-driven technique consumed by `Settings.js#renderWeightInputs`. The CSS contract MUST therefore keep `background-image`, `background-repeat: no-repeat`, and `background-position` set on the input element itself so the inline `background-size` percentage from the React render path produces the filled portion at runtime. The JSX caller MUST NOT need any other property to make the fill respond.

#### Scenario: Background-size percentage maps to filled-track width

- **WHEN** `Settings.js#renderWeightInputs` renders a slider whose value
  is half-way between its min and max
- **THEN** the rendered element's inline `background-size` resolves to
  approximately `50% 100%` and the visible brand-primary portion of the
  track ends near the centre of the slider, aligned with the thumb's
  current position.

#### Scenario: Dragging the thumb updates the filled-track width

- **WHEN** a user drags a score-weight slider's thumb from its initial
  position towards the maximum end
- **THEN** the slider's `background-size` width percentage increases in
  step with the input's reported `value`, and the filled brand-primary
  portion of the track visually extends to follow the thumb.

### Requirement: Slider styling sources colour from the brand-primary token

The restyled `input[type='range']` rule and its pseudo-element rules SHALL reference `var(--fp-brand-primary)` (and only the brand-primary token from the `--fp-brand-primary*` family) for the leading-track fill, the thumb fill, and any optional hover ring. No new `#b40089` or `rgb(180, 0, 137)` literal MAY be introduced by this change. The white halo MAY be a literal `#fff` because it is a contrast device, not part of the brand palette.

#### Scenario: No brand hex literal added to the slider rule

- **WHEN** a contributor greps `packages/front/src/App.css` for
  `#b40089` or `rgb(180, 0, 137)` after this change
- **THEN** no match falls inside the `input[type='range']` rule or its
  pseudo-element rules; the rule references `var(--fp-brand-primary)`
  instead.
