## ADDED Requirements

### Requirement: The local demo workflow MUST record a before video on request

When a PR body has a `demo-test-before` block naming a test, the local demo
workflow SHALL record that test with `DEMO_PHASE=before` against the app code of
the merge commit's first parent, using the test files of the merge commit, and
SHALL upload and comment on the before recording separately from the after
recording. Without the block the workflow SHALL record no before video.

#### Scenario: Before and after recordings
- **WHEN** a PR body has a `demo-test` block and a `demo-test-before` block
- **THEN** the workflow records an after video against the merge commit and a before video against its first parent, and comments on the PR with a link to each

#### Scenario: No before block
- **WHEN** a PR body has only a `demo-test` block
- **THEN** the workflow records only the after video and starts no before job

#### Scenario: Before block naming a test without `casesBeforeChange`
- **WHEN** the `demo-test-before` block names a `demoTest` file without `casesBeforeChange`
- **THEN** the before job fails with a message saying the test defines no `casesBeforeChange`

### Requirement: A demo test MUST be able to define cases for the UI before the change in the same file

The `demoTest` helper SHALL run `cases` unless `DEMO_PHASE` is `before`, in
which case it SHALL run `casesBeforeChange`, with the same setup and teardown.

#### Scenario: Default phase
- **WHEN** a demo test using `demoTest` runs without `DEMO_PHASE`
- **THEN** only its `cases` run

#### Scenario: Before phase
- **WHEN** the same test runs with `DEMO_PHASE=before`
- **THEN** only its `casesBeforeChange` run
