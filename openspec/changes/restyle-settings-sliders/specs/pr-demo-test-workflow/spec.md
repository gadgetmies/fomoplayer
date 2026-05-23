## ADDED Requirements

### Requirement: Trusted PRs opt into the demo recording workflow via a fenced block

A PR that wants `.github/workflows/pr-demo.yml` to run a committed cascade-test SHALL embed in its PR body a fenced code block tagged exactly `demo-test` whose single line is the path to a committed cascade-test file, relative to `packages/back/`. The workflow MUST only run when the PR author's `author_association` is `OWNER` or `COLLABORATOR`, so drive-by PRs cannot consume Railway preview minutes or GitHub Actions minutes on the maintainer's account. No GitHub label is required to trigger the workflow — the fenced block is the sole opt-in signal.

#### Scenario: Workflow runs when a trusted PR is opened with a fenced demo-test block

- **WHEN** an `OWNER` or `COLLABORATOR` opens (or edits, reopens, or
  pushes commits to) a pull request whose body contains a fenced
  ` ```demo-test ` block naming a real committed test path under
  `packages/back/test/browser/`
- **THEN** the `pr-demo.yml` workflow's `demo-test` job runs, executes
  `npx cascade-test <path>` against the Railway preview URL, and
  uploads the recorded video as the `demo-video-pr-<number>` artifact.

#### Scenario: Workflow is skipped when the PR has no fenced demo-test block

- **WHEN** a pull request is opened or edited and its body does not
  contain a fenced ` ```demo-test ` block
- **THEN** the `demo-test` job's `if:` guard evaluates to false and
  the job is skipped without running any steps — no cascade-test
  executes, no comment is posted.

#### Scenario: Workflow is skipped when the PR author is not trusted

- **WHEN** a contributor whose `author_association` is not `OWNER` or
  `COLLABORATOR` opens a pull request that contains a fenced
  ` ```demo-test ` block
- **THEN** the `demo-test` job's `if:` guard evaluates to false and
  the job is skipped — no Railway preview minutes or GitHub Actions
  minutes are consumed on the maintainer's account.

### Requirement: The PR for this change ships a cascade-test file that drives the new slider

This change SHALL ship a committed cascade-test file at `packages/back/test/browser/settings-slider.js` that opens the settings page, exercises the restyled score-weight slider end-to-end, and emits visible motion suitable for a Playwright video recording. The test MUST assert at least one observable change to a score-weight slider's reported value or filled-track width after a simulated user interaction, so a green run proves the slider is functional and the recording proves it visually.

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
  is opened by an `OWNER` or `COLLABORATOR` so the workflow runs
  against the Railway preview deployment.
