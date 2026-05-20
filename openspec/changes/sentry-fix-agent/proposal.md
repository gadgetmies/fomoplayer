## Why

Production errors today are caught by users, not by us. By the time someone
reports a regression in the front-end, browser-extension, CLI, or backend,
it has usually been live for hours. We have no shared error pipeline and no
mechanical link between an error and a code fix. We want errors to trigger
their own investigation: a coding agent reads the stack trace, opens a draft
PR with a candidate fix, and a human reviews the Railway preview before
merging. That collapses detection-to-candidate-fix from "next standup" to
"next webhook tick", with human judgement preserved at the merge gate.

## What Changes

- Instrument all four runtime packages (`packages/back`, `packages/front`,
  `packages/browser-extension`, `packages/cli`) with Sentry SDKs sharing a
  single hosted Sentry project, so issues group across surfaces and a single
  webhook covers every error source.
- Add a new `/api/sentry-webhook` route in `packages/back` that receives
  Sentry `issue.created` and `issue.unresolved` events, verifies the HMAC
  signature, applies a checked-in denylist + threshold + rate-limit
  pipeline, and dispatches eligible events as GitHub issues with a
  `workflow_dispatch` call.
- Add a checked-in denylist/threshold/rate-limit config module
  (`packages/back/config/sentry-triage.js`) so noise filtering goes through
  PR review, not an admin UI.
- Add GitHub Actions workflows for the fix loop:
  - `sentry-fix.yml` — assembles agent context (event JSON, stack-trace
    source files, prior-attempts), runs the coding-agent action, opens a
    DRAFT PR linked to the triage issue. Railway auto-deploys a preview.
  - `sentry-resolve.yml` — on merged PRs carrying a `sentry:<id>` label,
    marks that Sentry issue resolved plus any IDs listed in a
    ` ```sentry-also-resolves ``` ` fenced block in the PR body. Also
    handles close-without-merge: applies a `wont-fix` label to both the PR's
    linked issue and the Sentry issue.
  - `sentry-cron.yml` — hourly cap-recovery sweep so events dropped by a
    daily rate limit (or a missed webhook) get re-tried once the window
    rolls over.
- Adopt a GitHub-and-Sentry-as-source-of-truth dedup model: `sentry:<id>`
  and `sentry-fix` labels, a `wont-fix` permanent-skip label, and a
  stale-bot rule that closes draft `sentry-fix` PRs (and their linked
  issues) after 14 days so the dedup slot is freed.
- Provision a GitHub App installation (preferred over a PAT) whose token
  the triage route uses to create issues and dispatch the fix workflow.

## Capabilities

### New Capabilities

- `sentry-error-reporting`: Sentry SDK setup, source maps, and `release`
  tagging across `packages/back`, `packages/front`,
  `packages/browser-extension`, and `packages/cli`, all reporting into a
  single hosted Sentry project.
- `sentry-triage-webhook`: backend `/api/sentry-webhook` endpoint with HMAC
  verification, denylist/threshold filters, GitHub-search dedup,
  `maxInFlight` / `maxDispatchesPerDay` rate limits, structured skip-reason
  logging, and GitHub dispatch on pass.
- `sentry-fix-workflow`: GitHub Actions workflows (`sentry-fix.yml`,
  `sentry-resolve.yml`, `sentry-cron.yml`), the PR/issue/label conventions
  they rely on (`sentry:<id>`, `sentry-fix`, `wont-fix`,
  ` ```sentry-also-resolves ``` ` block), the GitHub App token, and the
  stale-bot configuration that bounds in-flight work.

### Modified Capabilities

<!-- None. No existing spec in openspec/specs/ touches error monitoring,
     coding agents, or CI workflows for this loop. -->

## Impact

- **Code**:
  - New: `packages/back/routes/sentry-webhook.js`,
    `packages/back/config/sentry-triage.js`,
    `packages/back/services/github-dispatch.js`, plus tests under
    `packages/back/test/tests/sentry-triage/` and
    `packages/back/test/tests/sentry-webhook.js`.
  - New: `.github/workflows/sentry-fix.yml`,
    `.github/workflows/sentry-resolve.yml`,
    `.github/workflows/sentry-cron.yml`, a PR template addition for
    the ` ```sentry-also-resolves ``` ` block, and a stale-bot config
    update.
  - Modified: each of the four packages adds Sentry SDK initialisation
    and (where applicable) source-map upload steps to its build.
- **Configuration**:
  - New env vars: `SENTRY_DSN_*` per package, `SENTRY_WEBHOOK_SECRET`,
    `SENTRY_API_TOKEN`, `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
    `GITHUB_APP_INSTALLATION_ID`. All resolved through the existing
    `fomoplayer_shared/config` loader on the backend; the extension and
    front-end read their DSN via the existing `EnvironmentPlugin` /
    `DefinePlugin` injection per the project's no-hardcoded-URLs policy.
- **External systems**: hosted Sentry (free tier), a new GitHub App
  installed on the repo, Railway preview environments (existing, used
  unchanged), and the chosen coding-agent GitHub Action.
- **Dependencies (new)**: `@sentry/node`, `@sentry/browser`,
  `@octokit/rest`, `@octokit/auth-app`.
- **Operational**: triage logs surface skip reasons so the denylist can be
  tuned over time; cap breaches log at `warn` so they are visible without
  being silently swallowed. Failure-mode handling (bad signature → 401,
  GH API blip → 500 so Sentry retries, agent can't fix → comment on the
  issue and keep it open) is enumerated in design.
- **Rollout**: bring-up is staged (instrument → observe → triage route
  behind a flag → issue-only dispatch → workflow → resolve → cron → enable
  webhook) so each step is independently shippable and reversible.
