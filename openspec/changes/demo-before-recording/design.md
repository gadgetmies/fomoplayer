## Context

`actions/checkout` on a `pull_request` event checks out
`refs/pull/<n>/merge`: a merge commit of the PR head onto the current tip of
`master`. The local demo workflow therefore already records master + the PR.
Demo tests live in `packages/back/test/browser/` and use cascade-test, whose
suite is the plain object passed to `test()`.

## Goals / Non-Goals

**Goals:** a before video whose only difference from the after video is the
PR's changes; before and after flows defined in one test file; no change to
normal CI runs of demo tests.

**Non-Goals:** before recordings for the Railway preview workflow (no deployed
before app exists); a stitched side-by-side video (possible follow-up).

## Decisions

- **Before = the merge commit's first parent (`HEAD^1`).** It is exactly the
  `master` commit the after run is merged onto, so the two runs differ only by
  the PR's changes. The merge base would differ by everything merged to
  `master` since the branch started, which can break the before run on an
  un-rebased branch. `HEAD^1` rather than `pull_request.base.sha`, because it
  is by definition the parent of the commit checked out.
- **Tests come from the merge commit.** The before job restores
  `packages/back/test` from `HEAD` after switching the rest of the tree to
  `HEAD^1`, so `casesBeforeChange`, written in the PR, run with the same helpers
  as `cases`.
- **Opt-in block, not a requirement.** A before video is only recorded for a
  ` ```demo-test-before ` block naming the test, so demo tests never have to
  implement `casesBeforeChange`. The block names a file, so it can be the same file as
  ` ```demo-test ` (with `demoTest` and `casesBeforeChange`) or a separate test.
- **One file, phase chosen by `DEMO_PHASE`.** `demoTest({ setup, teardown,
  cases, casesBeforeChange })` passes `cases` (default) or `casesBeforeChange`
  to `test()`. The names say what they are: case objects, not setup hooks
  (mocha's `before()` would suggest the latter). In the before phase a file
  without `casesBeforeChange` fails with a message naming the block, since the
  PR asked for a before video it cannot record.
- **A plan job builds the matrix.** It reads the blocks from the PR body into
  one matrix entry per recording (phase + test file), so a PR without the
  before block starts no before job. Both phases share every recording step and
  name the artifact, trace path and comment by phase.

## Risks / Trade-offs

- The before job uses the old commit's dependencies and database migrations. A
  before case cannot use a package, table or endpoint the PR adds; its setup
  must seed through what existed before.
- A before video roughly doubles the local demo's runner time (the two jobs run
  in parallel). PRs without the block pay only for the small plan job.
