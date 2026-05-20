## 1. Sentry instrumentation (all four packages)

- [x] 1.1 Add `@sentry/node` to `packages/back`; initialise in the
  Express bootstrap before middleware registration; install the Sentry
  error-handling middleware; tag events `runtime: back`; read `SENTRY_DSN`
  via `fomoplayer_shared/config`; treat missing DSN as "disabled mode"
  without crashing
- [x] 1.2 Add `@sentry/browser` to `packages/front`; initialise at app
  bootstrap; tag events `runtime: front`; read DSN via build-time
  `EnvironmentPlugin` / `DefinePlugin` injection so the bundle never
  embeds a literal
- [x] 1.3 Add `@sentry/browser` to `packages/browser-extension`;
  initialise in the service worker and in content scripts (separate
  init calls); tag events `runtime: extension`; read DSN via build-time
  injection; verify the bundle ships no literal DSN when env var is
  unset
- [x] 1.4 Add `@sentry/node` to `packages/cli`; initialise at CLI
  startup; tag events `runtime: cli`; read `SENTRY_DSN` from
  environment
- [x] 1.5 Set `release` for each package: backend / front-end / CLI from
  the package version or git short SHA at build time; extension from
  the `version` field in `manifest.json`
- [x] 1.6 Wire front-end source-map upload to Sentry at production build
  time (Sentry CLI or the bundler plugin), associated with the same
  `release` value emitted by the runtime SDK
- [x] 1.7 Confirm errors-only configuration: tracing, profiling, replay,
  performance monitoring are NOT enabled in any package
- [x] 1.8 Add a query-param-gated test error to each surface (or
  equivalent feature-flagged trigger); verify each surface delivers a
  Sentry event tagged with the correct `runtime` and `release`
  (delivery verification deferred to operator with real Sentry account;
  triggers implemented:
  - back: `GET /api/debug/sentry-test?token=$SENTRY_TEST_TOKEN`
  - front: `/?sentryTest=1`
  - extension: `options.html?sentryTest=1`
  - cli: `fomoplayer sentry-test`)
- [x] 1.9 Document the new env vars (`SENTRY_DSN`, `SENTRY_ENVIRONMENT`)
  and build-time injection vars in the relevant package READMEs / `.env.example`

## 2. Observation window (manual)

- [ ] 2.1 Leave instrumentation running for at least a week of real
  traffic to collect baseline event volume
- [ ] 2.2 From observed events, draft an initial denylist for
  `packages/back/config/sentry-triage.js` (HTTP 404/401/403,
  `ECONNRESET`, access-log noise, and whatever else dominates)
- [ ] 2.3 Pick initial `thresholds.minEvents` and
  `thresholds.minTimeWindow` from observed distribution

## 3. Triage config module

- [x] 3.1 Create `packages/back/config/sentry-triage.js` exporting
  `denylist`, `thresholds`, and `rateLimit` per the design (initial
  values: `maxInFlight: 3`, `maxDispatchesPerDay: 10`); seed with the
  denylist and thresholds from step 2 (seeded with sensible defaults
  ahead of observation-window data; tune after step 2 completes)
- [x] 3.2 Unit-test the config module shape (no runtime behaviour yet);
  guard against accidental empty / undefined fields

## 4. Triage filter pipeline (pure functions)

- [x] 4.1 Implement `denylistMatch(event, config)` returning either
  `null` or `{ reason: 'denylist:<rule>' }`; cover `http_status`,
  `message_regex`, `logger_name` rule types
- [x] 4.2 Implement `belowThreshold(event, config)` returning either
  `null` or `{ reason: 'below_threshold' }`; use Sentry-supplied
  `event_count`, `firstSeen`, `lastSeen`
- [x] 4.3 Unit-test denylist matcher (table-driven: rule type × match /
  no-match)
- [x] 4.4 Unit-test threshold check with synthetic events at minEvents
  and time-window boundaries
- [x] 4.5 Implement `composePipeline(filters)` that runs filters in
  order, short-circuits on first skip, and returns either `pass` or
  `{ skip, reason }`; unit-test with a hand-rolled pipeline of fakes

## 5. GitHub dispatcher

- [x] 5.1 Add dependencies `@octokit/rest` and `@octokit/auth-app` to
  `packages/back`
- [x] 5.2 Create `packages/back/services/github-dispatch.js` with:
  - `findOpenForSentryIssue(sentryId)` — GH search
    `is:issue|pr is:open label:sentry:<id>`
  - `findPriorAttempts(sentryId)` — GH search for closed issues with the
    same label, returning each issue plus its merged-PR references
  - `hasWontFix(sentryId)` — true if any GH issue or PR with the label
    also carries `wont-fix`
  - `countInFlightFixPRs()` and `countTodayDispatches()` for cap checks
  - `createTriageIssue(sentryEvent, priorAttempts)` — issue with labels
    `[sentry:<id>, sentry-fix]`, body containing Sentry URL, event JSON,
    and `Prior attempts` section
  - `triggerFixWorkflow(issueNumber)` — `workflow_dispatch` against
    `sentry-fix.yml` with `issue_number` input
- [x] 5.3 Wire App-installation-token auth via `@octokit/auth-app`,
  reading `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_APP_INSTALLATION_ID` from config; allow PAT (`GITHUB_TOKEN`)
  as a fallback for v0 spike
- [x] 5.4 Unit-test the dispatcher with mocked Octokit responses for
  every search variant; assert label and body shape on
  `createTriageIssue`

## 6. Sentry webhook route

- [x] 6.1 Create `packages/back/routes/sentry-webhook.js` mounted at
  `POST /api/sentry-webhook`; raw-body parser so HMAC can verify against
  the exact bytes
- [x] 6.2 Implement HMAC signature verification using
  `SENTRY_WEBHOOK_SECRET`; return `401` on mismatch and log at `error`
- [x] 6.3 Accept event types `issue.created` and `issue.unresolved`;
  reject (200 + skip) anything else
- [x] 6.4 Compose the filter pipeline (`denylistMatch` →
  `belowThreshold` → in-flight dedup → `wont-fix` check → in-flight cap
  → daily-dispatch cap); for each skip, return `200` with the skip
  reason in the response body and emit a structured log entry
- [x] 6.5 On `pass`: call `createTriageIssue` then `triggerFixWorkflow`;
  return `200` with the new issue number; on `5xx` from GitHub return
  `500` so Sentry retries
- [x] 6.6 Gate the route behind a `TRIAGE_ENABLED` env-var flag (default
  false) so it can ship dark
- [ ] 6.7 Subscribe Sentry to the new endpoint (event types as above);
  store the resulting webhook secret in `SENTRY_WEBHOOK_SECRET`
  (deferred to operator: requires Sentry dashboard access)
- [x] 6.8 Integration test (`packages/back/test/tests/sentry-webhook.js`)
  hits the route with a fixture body + valid signature against stubbed
  Octokit and asserts: GH issue created with correct labels and body,
  `workflow_dispatch` called with the new issue number
- [x] 6.9 Negative integration tests: bad signature → 401; denylisted
  event → 200 + no dispatch; in-flight event → 200 + no dispatch

## 7. GitHub App provisioning

- [ ] 7.1 Register a GitHub App with permissions: `issues:write`,
  `pull-requests:write`, `contents:write`, `actions:write`,
  `metadata:read`
- [ ] 7.2 Install the App on the repository; record the installation ID
- [ ] 7.3 Store `GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`,
  `GITHUB_APP_INSTALLATION_ID` in production config (and the equivalent
  in the GitHub Actions secret store for workflow use)

## 8. Fix workflow

- [x] 8.1 Add `.github/workflows/sentry-fix.yml` triggered by
  `workflow_dispatch` with `issue_number` input
- [x] 8.2 Checkout `master` with the App token (`contents:write`,
  `pull-requests:write`)
- [x] 8.3 Read the referenced issue body via `gh api` or `actions/github-script`;
  extract Sentry event JSON, stack trace, and the `Prior attempts`
  section
- [x] 8.4 Assemble the agent prompt: instructions ("investigate, open a
  draft PR linked to this issue, do not auto-merge"), the Sentry event
  JSON, the failing `release`, every stack-trace source file (truncated
  per a configurable per-file byte budget; document truncation in the
  PR body), the issue URL, and the prior-attempts section
- [x] 8.5 Run `anthropics/claude-code-action` (or the chosen equivalent)
  with that prompt
- [x] 8.6 Configure the agent step to open a DRAFT PR with labels
  `sentry:<id>` and `sentry-fix`, linked via `Closes #<N>`, and to never
  mark it ready for review or merge
- [x] 8.7 Branch the agent step: if it finishes without opening a PR,
  post a reasoning comment on the triage issue; the issue stays open
  (counts toward `maxInFlight`)
- [ ] 8.8 Dry-run the workflow against a handcrafted issue (no
  webhook involved); confirm the agent action runs end-to-end and opens
  a draft PR (deferred to operator: requires the App secrets to exist
  and a manual `gh workflow run`)

## 9. Resolve-on-merge workflow

- [x] 9.1 Add `.github/workflows/sentry-resolve.yml` triggered on
  `pull_request: closed` events
- [x] 9.2 If `merged == true` and the PR carries any `sentry:<id>`
  label, call the Sentry API to mark `<id>` resolved
- [x] 9.3 Parse a fenced `sentry-also-resolves` code block from the PR
  body; for each non-empty line, mark that Sentry ID resolved too
- [x] 9.4 If the Sentry resolve API call fails, fail the workflow loudly
  and post a PR comment listing the IDs that need manual resolution
- [x] 9.5 If `merged == false` and the PR carries any `sentry:<id>`
  label, apply the `wont-fix` label to the PR, to any open GH issue
  carrying the same `sentry:<id>` label, and to the Sentry issue
- [ ] 9.6 Store `SENTRY_API_TOKEN` (auth token with project resolve
  permission) in the Actions secret store
  (deferred to operator: GH repo secret store access)
- [ ] 9.7 Test the merge path on a synthetic PR; test the
  close-without-merge path on another synthetic PR
  (deferred to operator: requires a live Sentry project and at least one
  merged + one unmerged sentry-labelled synthetic PR)

## 10. PR template & stale-bot

- [x] 10.1 Update the repository PR template
  (`.github/PULL_REQUEST_TEMPLATE.md`) to include an empty
  `sentry-also-resolves` fenced code block under a "Sentry" heading
  (created — no prior template existed)
- [x] 10.2 Add / update stale-bot config to close draft PRs labelled
  `sentry-fix` after 14 days of no activity; configure the same job
  (or a companion `actions/github-script` step in the stale workflow)
  to close any open GH issue sharing a `sentry:<id>` label with the
  closed PR (added `.github/workflows/sentry-stale.yml`; no prior
  stale-bot existed)

## 11. Cap-recovery cron

- [x] 11.1 Add `.github/workflows/sentry-cron.yml` triggered hourly
  (`cron: '0 * * * *'`) plus manual `workflow_dispatch`
- [x] 11.2 List unresolved Sentry issues via the Sentry API and, for
  each one without an in-flight GH issue or PR sharing its
  `sentry:<id>` label, POST a synthetic event to `/api/sentry-webhook`
  (signed with `SENTRY_WEBHOOK_SECRET`) so the same filter pipeline
  applies
- [x] 11.3 Dispatch one at a time, respecting `maxInFlight` (the
  webhook itself enforces this — the cron just iterates)
- [ ] 11.4 Test by manually creating a Sentry issue that the daily cap
  would have blocked yesterday and confirming the cron picks it up
  (deferred to operator: requires live Sentry traffic + cap-breached
  state)

## 12. Bring-up & cutover

- [ ] 12.1 With `TRIAGE_ENABLED=false`, run a synthetic Sentry issue and
  step through the chain manually: confirm the webhook is reachable,
  HMAC verifies, filters log skip reasons, and (with the flag flipped
  for one event) a draft PR opens and previews deploy on Railway
- [ ] 12.2 Run a synthetic regression: revert the synthetic fix, confirm
  Sentry fires `issue.unresolved`, and the cycle restarts with a
  `Prior attempts` section pointing at the earlier merged PR
- [ ] 12.3 Run a synthetic wont-fix: close the agent's draft PR without
  merging, confirm both the GH issue and the Sentry issue are labelled
  `wont-fix`, and confirm the next occurrence does NOT redispatch
- [ ] 12.4 Flip `TRIAGE_ENABLED=true` for real Sentry traffic; monitor
  the first day's skip-reason log distribution and tune the denylist
  / thresholds as needed
