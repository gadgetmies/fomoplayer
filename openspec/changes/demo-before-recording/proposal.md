## Why

A PR's demo video shows the feature after the change, but a reviewer has to
remember or guess what the screen looked like before it. Recording the same
flow on the code without the PR's changes makes the difference visible in the
PR itself.

## What Changes

- An optional ` ```demo-test-before ` block in the PR body makes the local demo
  workflow (`pr-demo-local.yml`) record a second "before" video next to the
  existing one. It runs the named test from the PR against the app code of the
  commit the PR would merge onto. Without the block nothing changes: before
  videos are never required.
- A demo test can define `casesBeforeChange` next to its ordinary `cases` in
  the same file. They run only when the workflow records the before video;
  every other run (normal CI, local runs, the demo-test and demo-preview
  recordings) runs `cases` as today.
- The `demo-tests` skill documents the optional block and `casesBeforeChange`, and recommends opening the PR early so the videos are recorded while the work goes on.

## Capabilities

### New Capabilities
- `demo-before-recording`: before/after demo recordings for the local demo
  workflow and the `demoTest` helper that splits a test into before and after
  cases.

### Modified Capabilities

(none)

## Impact

- `.github/workflows/pr-demo-local.yml`: a `plan` job that turns the demo
  blocks into a matrix of recordings.
- `packages/back/test/lib/demo-test.js`: `demoTest()` and `isBeforeChange`.
- `.claude/skills/demo-tests/SKILL.md`: the optional block, `casesBeforeChange`,
  and opening the PR early so the videos are recorded while the work goes on.
- The preview workflow (`pr-demo-preview.yml`) is unchanged: there is no
  deployed "before" app to record against.
