## ADDED Requirements

### Requirement: PRs opt into the demo recording workflow via a label and a fenced block

A PR that wants `.github/workflows/pr-demo.yml` to run a committed cascade-test SHALL carry the GitHub label `demo-test` AND embed in its PR body a fenced code block tagged exactly `demo-test` whose single line is the path to a committed cascade-test file, relative to `packages/back/`. Both pieces MUST be present: the label is what triggers the workflow, and the fenced block is how the workflow discovers which test to run.

#### Scenario: Workflow runs when the label and the fenced block are both present

- **WHEN** a maintainer applies the `demo-test` label to a pull request
  whose body contains a fenced ` ```demo-test ` block naming a real
  committed test path under `packages/back/test/browser/`
- **THEN** the `pr-demo.yml` workflow's `demo-test` job runs, executes
  `npx cascade-test <path>` against the Railway preview URL, and
  uploads the recorded video as the `demo-video-pr-<number>` artifact.

#### Scenario: Workflow fails fast if the fenced block is missing

- **WHEN** the `demo-test` label is applied to a PR whose body has no
  ` ```demo-test ` fenced block
- **THEN** the workflow step "Extract test file from PR body" fails the
  job with the error `No \`\`\`demo-test\`\`\` block found in PR body`
  and no test is executed.

### Requirement: The PR for this change ships a cascade-test file that drives the new slider

This change SHALL ship a committed cascade-test file at
`packages/back/test/browser/settings-slider.js` that opens the settings
page, exercises the restyled score-weight slider end-to-end, and emits
visible motion suitable for a Playwright video recording. The test MUST
assert at least one observable change to a score-weight slider's
reported value or filled-track width after a simulated user
interaction, so a green run proves the slider is functional and the
recording proves it visually.

#### Scenario: Demo test drags a settings slider and asserts the value moved

- **WHEN** the cascade-test runner executes
  `packages/back/test/browser/settings-slider.js` against a live
  preview
- **THEN** the test navigates to `/settings`, waits for the score-
  weight slider inputs to render, captures the initial value of the
  first score-weight slider, simulates user input on its thumb (mouse
  drag and/or arrow-key presses with `keyboard.press`), and asserts
  that the slider's reported `value` (or its sibling number input's
  `value`) is different from the initial value when the interaction
  completes.

#### Scenario: The PR description points the workflow at the new test

- **WHEN** the PR for this change is opened
- **THEN** its body contains a fenced ` ```demo-test ` block whose
  sole content line is `test/browser/settings-slider.js`, and the PR
  carries the `demo-test` GitHub label so the workflow runs against
  the Railway preview deployment.
