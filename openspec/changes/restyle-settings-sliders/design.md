## Context

The settings page (`/settings`) exposes a stack of score-weight inputs
rendered by `Settings.js#renderWeightInputs`. Each one is an
`<input type="range">` whose track and thumb today come from the
single `input[type='range']` rule in `packages/front/src/App.css`. The
existing rule:

- Sets the bar height to `1rem`, fills it with a `#222` background
  with a `linear-gradient(var(--fp-brand-primary), …)` painted across
  the leading portion via `background-size`.
- Renders a `1rem × 1rem`, rounded-`0.25rem` **white** thumb with a
  faint dark shadow.

The mockup the maintainer shared (square aspect ratio, dark backdrop)
shows a different visual language:

- A very thin horizontal track (looks like a 1–2 px hairline) sitting
  on a dark surface.
- A small circular thumb filled with brand magenta and ringed by a
  white halo. No square corners. No drop shadow.

The change is purely a CSS rewrite (no React or DOM changes). It is
also a convenient candidate for proving the recently-added `demo-test`
PR workflow, which already exists at `.github/workflows/pr-demo.yml`
and runs against a Railway preview when a PR is labelled `demo-test`
and contains a ` ```demo-test ` block in its body.

## Goals / Non-Goals

**Goals:**

- Replace the slider visual with a thin track + circular brand thumb
  that matches the mockup, sourcing colours from the existing
  `--fp-brand-primary*` tokens so the theme contract is preserved.
- Cover WebKit (Chrome/Safari) and Gecko (Firefox) pseudo-elements so
  the new look is consistent across the browsers the front-end
  targets.
- Keep the React/JSX call sites (`Settings.js`) untouched apart from
  removing inline styles that would fight the new CSS.
- Ship a committed `cascade-test` browser test that opens
  `/settings`, drags a slider thumb, and asserts the numeric value
  and the filled-track width respond — so the `demo-test` workflow
  picks it up and produces a recorded video/trace artifact.

**Non-Goals:**

- Changing the score-weight model, defaults, min/max, or step values.
- Restyling other range inputs outside the settings page beyond what
  the global `input[type='range']` rule already governs (the rule is
  global today and stays global; we do not introduce per-page
  variants).
- Modifying the `pr-demo.yml` workflow itself — we only consume it.
- Introducing a new component library or replacing the native input
  element. The native `<input type="range">` stays.

## Decisions

### 1. Keep the native `<input type="range">`, restyle via CSS only

**Choice:** Edit the existing global `input[type='range']` rule (and
its pseudo-element children) in `packages/front/src/App.css`. No JSX
changes beyond pruning inline styles that conflict.

**Alternatives considered:**

- *Replace with a React slider component (`rc-slider`, Radix, etc.)* —
  Rejected. Adds a dependency, forces a rewrite of
  `renderWeightInputs`, and risks accessibility regressions on a
  visual-only ticket.
- *Per-page `.settings-slider` class* — Rejected. The global rule
  already paints every range input on the site (only the settings
  page renders any today). A page-scoped class adds specificity churn
  without changing the rendered surface.

**Rationale:** native inputs already give us keyboard accessibility,
ARIA, and form semantics for free. The mockup is a pure paint job.

### 2. Track + thumb geometry

**Choice:**

- Track height: `2px` (hairline) painted on a transparent backdrop so
  the surrounding dark UI shows through. The leading portion painted
  in `var(--fp-brand-primary)` via `background-image` +
  `background-size` (the existing technique — keeps JS unchanged).
- Thumb: circular (`border-radius: 50%`), `14px × 14px`,
  `background: var(--fp-brand-primary)`, `border: 2px solid #fff`
  to produce the white halo seen in the mockup. No drop shadow.
- Container height stays `1rem` so the thumb has room to render
  without clipping; the visible track is centred via
  `background-position: center` and a `2px` gradient stripe.

**Alternatives considered:**

- *1 px track* — Rejected. Renders inconsistently across DPI and at
  some zooms disappears entirely. 2 px is the minimum that survives
  fractional scaling.
- *Solid grey track instead of transparent* — Rejected. The mockup
  shows the dark surface bleeding through; a hard-coded track colour
  would clash on lighter surfaces (we do not have a guaranteed
  background colour for every page that hosts a slider).

### 3. Firefox parity

**Choice:** add explicit `::-moz-range-track` and `::-moz-range-thumb`
rules mirroring the WebKit pseudo-elements. The track-fill technique
(painting the background gradient on the input itself) works in
Firefox because Firefox lets the input's own `background` show through
the track when the track itself is `background: transparent`.

**Alternatives considered:**

- *Lean on `accent-color` only* — Rejected. `accent-color` recolors
  the thumb and the filled portion, but does not let us change the
  thumb shape or add the white halo.

### 4. Cascade-test as the demo vehicle

**Choice:** add `packages/back/test/browser/settings-slider.js`. The
file uses the existing `cascade-test` framework already used by
`test/browser/settings.js` and friends. It will:

1. Navigate to `/settings` (the score-weights section).
2. Wait for the score-weight slider inputs to render.
3. Read the initial numeric value from the sibling number input.
4. Drag the first slider's thumb with Playwright's mouse API and
   keyboard arrows so the motion is visible on the recording.
5. Assert the sibling number input updates and that the computed
   `background-size` of the slider element changes (proving the
   filled portion responded).

**Alternatives considered:**

- *Mocha + jsdom unit test* — Rejected. The point of this exercise is
  to drive the `demo-test` workflow, which expects a Playwright-driven
  cascade-test producing a video.
- *Synthetic input event without dragging* — Rejected. The recording
  would be a 0-frame change. The drag-with-arrows path is slower but
  produces a meaningful video.

### 5. PR-demo wiring

**Choice:** the PR opened from this branch will embed a fenced block
of the exact form `.github/workflows/pr-demo.yml` expects in its body:

```demo-test
test/browser/settings-slider.js
```

The workflow triggers on `pull_request: types: [opened, edited,
synchronize, reopened]` and gates the `demo-test` job on (a) the body
containing a fenced ` ```demo-test ` block and (b) the PR
`author_association` being `OWNER` or `COLLABORATOR`. No GitHub label
is needed; the fenced block is the sole opt-in signal. The workflow
reads the path relative to `packages/back/` and runs `cascade-test`
against the Railway preview deployment, uploading the recorded video
as `demo-video-pr-<n>` and commenting on the PR with a link to the
run.

**Rationale:** an earlier draft of this change used a `demo-test`
label as the trigger, paired with an auto-label workflow that
applied it from the body. That broke against GitHub's safety rule
that `GITHUB_TOKEN`-emitted events do not propagate to other
workflows, so the labelled event never reached `pr-demo.yml`. The
fenced block + author-association gate sidesteps the propagation
issue and keeps the cheap maintainer protection against drive-by PRs
spending Railway preview minutes.

## Risks / Trade-offs

- **Risk:** the hairline track is visually fragile on light
  backgrounds (the score-weights section sits on a dark surface
  today, so this is currently OK, but future placements of the slider
  could land on white). → **Mitigation:** the requirement only
  constrains the **settings** placement, and we document the dark-
  backdrop assumption in the spec scenario. A future change can layer
  a per-context track colour if/when a slider appears on a light
  surface.

- **Risk:** Firefox's track-fill technique is implemented by reusing
  the input's `background`. Some Firefox versions render the thumb
  area as a clipped rectangle, briefly exposing the input background
  through the thumb. → **Mitigation:** the thumb's solid brand fill
  plus white border masks this completely; no `box-shadow` tricks
  required.

- **Risk:** `demo-test` workflow contractual drift (someone could
  rename the label or the fenced-block tag). → **Mitigation:** the
  new `pr-demo-test-workflow` spec encodes the contract so future
  edits to the workflow flag it as a spec-level change.

- **Trade-off:** keeping the global selector means the new look will
  apply anywhere on the site that hosts an `<input type="range">`.
  Today that is only the settings page; this is the cheapest design
  and we accept it.

## Migration Plan

- Pure-CSS change ships in the same commit as the test. No data
  migration, no flag, no rollout staging. Revert is a single-file
  `git revert`.
- The cascade-test file is new — running it requires the Railway
  preview to be live, but it is only invoked by the `pr-demo.yml`
  workflow when the `demo-test` label is present, so it does not
  block CI on PRs that opt out.

## Open Questions

_None._
