## ADDED Requirements

### Requirement: Fix workflow dispatches a coding agent against a triage issue

A workflow at `.github/workflows/sentry-fix.yml` SHALL be triggered by
`workflow_dispatch` with an `issue_number` input. The workflow SHALL:

1. Check out `master`.
2. Read the referenced issue's body and extract the Sentry event JSON and
   stack trace.
3. Assemble a prompt containing the Sentry event, the failing release
   version, the contents of every source file referenced in the stack
   trace, the issue URL, and the issue body's `Prior attempts` section.
4. Run the chosen coding-agent GitHub Action with that prompt and a token
   with `contents:write` and `pull-requests:write` scopes for this
   repository.
5. Instruct the agent to open a DRAFT PR linked to the triage issue. The
   agent SHALL NOT auto-merge.

#### Scenario: Workflow runs against a real issue

- **WHEN** `workflow_dispatch` is invoked with `issue_number=<N>` and that
  issue carries label `sentry-fix`
- **THEN** the workflow assembles the prompt from the issue body and the
  stack-trace source files, runs the coding-agent action, and the run
  completes (whether or not the agent opens a PR)

#### Scenario: Agent opens a draft PR

- **WHEN** the agent finds a candidate fix
- **THEN** it opens a DRAFT PR carrying labels `sentry:<id>` (inherited
  from the linked issue) and `sentry-fix`, linked to the triage issue
  with a `Closes #<N>` reference, and the PR is not marked ready for
  review

#### Scenario: Agent declines to open a PR

- **WHEN** the agent cannot find or commit to a fix
- **THEN** it posts a comment on the triage issue explaining its
  reasoning, opens no PR, and the issue remains open (still counts toward
  `maxInFlight`)

### Requirement: Resolve workflow closes the Sentry loop on merge

A workflow at `.github/workflows/sentry-resolve.yml` SHALL trigger on
`pull_request: closed` events. When `merged == true` AND the PR carries a
`sentry:<id>` label, it SHALL:

1. Mark the primary `<id>` resolved via the Sentry API.
2. Parse a fenced code block of language `sentry-also-resolves` from the
   PR body, treat each non-empty line as an additional Sentry issue ID,
   and mark each resolved via the Sentry API.

If the Sentry API call fails, the workflow SHALL fail loudly and post a
comment on the PR naming the Sentry IDs that need manual resolution.

#### Scenario: Merge resolves the primary Sentry issue

- **WHEN** a PR carrying label `sentry:ABC` is merged
- **THEN** the resolve workflow calls the Sentry API to mark issue `ABC`
  resolved

#### Scenario: Sentry-also-resolves block resolves additional IDs

- **WHEN** a merged PR's body contains a `sentry-also-resolves` fenced
  block listing `DEF` and `GHI` on separate lines
- **THEN** the resolve workflow marks `ABC` (from the label), `DEF`, and
  `GHI` all resolved in Sentry

#### Scenario: Sentry API failure surfaces a comment

- **WHEN** the Sentry resolve API returns a 5xx
- **THEN** the workflow run fails, and a comment is posted on the PR
  listing the Sentry IDs that still need manual resolution

### Requirement: Close-without-merge applies wont-fix labels

When a PR carrying a `sentry:<id>` label is closed without being merged,
`sentry-resolve.yml` SHALL apply the `wont-fix` label to:

- The PR itself,
- The triage issue linked from the PR (i.e. any open GH issue carrying the
  same `sentry:<id>` label),
- The Sentry issue (via the Sentry API, however the chosen Sentry account
  records this — annotation or tag).

The `wont-fix` label SHALL act as a permanent skip in the triage webhook
filter pipeline until a human removes it.

#### Scenario: Close without merge marks both sides wont-fix

- **WHEN** a draft PR labelled `sentry:ABC` is closed without being merged
- **THEN** the PR, any open GH issue labelled `sentry:ABC`, and the
  Sentry issue `ABC` are each annotated with `wont-fix`

#### Scenario: Removing wont-fix re-enables dispatch

- **WHEN** the `wont-fix` label is removed from both the GH side and the
  Sentry side, and Sentry then fires a new event for `ABC`
- **THEN** the next triage pass treats `ABC` as eligible for dispatch
  (filters apply as normal)

### Requirement: Hourly cap-recovery cron

A workflow at `.github/workflows/sentry-cron.yml` SHALL run hourly. It
SHALL list unresolved Sentry issues that do not have an in-flight GH
issue or PR with label `sentry:<id>`, and for each one re-invoke the
triage pipeline (same filters, same dispatcher).

The cron MAY dispatch eligible events one at a time, respecting
`maxInFlight`. If the cron is disabled or failing, the system SHALL still
function on the webhook path alone.

#### Scenario: Cron picks up a dispatch dropped by daily cap

- **WHEN** the daily dispatch cap rolls over and there exists a Sentry
  issue that was dropped during the previous day with no `wont-fix`
  label
- **THEN** within the next cron run that issue is re-triaged and, if
  filters pass, dispatched

#### Scenario: Cron respects maxInFlight

- **WHEN** the cron lists 5 eligible issues but `maxInFlight` is `3` and
  3 PRs are already open
- **THEN** the cron dispatches at most 0 of them and logs `inflight_cap`
  for the rest

### Requirement: Stale-bot frees dedup slots and PR template enables also-resolves

Stale-bot configuration SHALL close draft PRs labelled `sentry-fix` after
14 days of no activity. Because GitHub does not auto-close linked issues
when a PR is closed without merge, the configuration SHALL explicitly
close every open GH issue that shares a `sentry:<id>` label with the
closed PR.

The repository PR template SHALL include a `sentry-also-resolves` fenced
code-block placeholder so contributors (and the agent) know where to list
additional Sentry IDs that the PR addresses.

#### Scenario: Stale draft PR closes both PR and linked issue

- **WHEN** a draft PR labelled `sentry-fix` and `sentry:ABC` has no
  activity for 14 days
- **THEN** the stale-bot closes the PR AND closes any open GH issue
  carrying label `sentry:ABC`

#### Scenario: PR template ships the also-resolves block

- **WHEN** a contributor opens any PR via the GH UI
- **THEN** the PR template body contains an empty
  `sentry-also-resolves` fenced code block they can fill in
