# Sentry-triggered fix agent

## Summary

When errors fire in production, automatically triage them, dispatch a coding
agent to investigate, and let the agent open a draft PR with a proposed fix.
Humans review the PR against a live Railway preview before merging. Filters
keep noise out; GitHub + Sentry together hold the state, so the system stays
nearly stateless.

## Decisions log

| Question | Decision |
| --- | --- |
| Agent runtime | GitHub Action triggered on event (`anthropics/claude-code-action` or equivalent) |
| Error source | Hosted Sentry (free tier) |
| Triage policy | Dispatch on Sentry `issue.created` and `issue.unresolved` (regression), filtered by denylist + threshold |
| Dedup store | GitHub + Sentry as source of truth — no local DB for state |
| Fix delivery | Agent opens a draft PR; Railway auto-deploys a preview; human reviews. No auto-generated regression test in v1 |
| Triage host | New `/api/sentry-webhook` route in `packages/back` |
| Scope | Sentry instruments backend, frontend, browser-extension, CLI; agent allowed to modify any package |

## Architecture & data flow

```
Sentry SDK (back, front, ext, cli) ─► Sentry SaaS
                                          │
                                       webhook (issue.created, issue.unresolved)
                                          ▼
   /api/sentry-webhook  (new route in packages/back)
     1. verify Sentry HMAC signature
     2. apply denylist
     3. apply threshold
     4. dedup: GH search for open issue/PR labelled sentry:<id>
     5. enforce maxInFlight / maxDispatchesPerDay caps
     6. on pass: create GH issue + workflow_dispatch
                                          │
                                          ▼
   GH issue labelled sentry:<id>, sentry-fix
     ↓ workflow_dispatch
   .github/workflows/sentry-fix.yml
     - claude-code-action with prompt assembled from Sentry event,
       stack-trace source files, and issue body
     - agent investigates, opens DRAFT PR linked to the issue
                                          │
                                          ▼
   Railway auto-deploys preview (any PR, draft included)
   Human reviews preview + diff → marks ready → merges
                                          │
                                          ▼
   .github/workflows/sentry-resolve.yml (on merged PR with sentry:<id>)
     - calls Sentry API to mark <id> resolved
   If error returns: Sentry fires "issue.unresolved" → cycle restarts
```

Three persistent surfaces hold truth: **Sentry** (errors + grouping +
resolved/unresolved state), **GitHub** (issues, PRs, labels — in-flight and
historical work), and **the codebase**. The triage service is the only
mutable code we add to the backend; everything else is config or workflow YAML.

## Components

### Sentry SDKs

- `packages/back`: `@sentry/node`, Express error middleware. `release` =
  backend version from git.
- `packages/front`: `@sentry/browser`, source maps uploaded at build time
  via Sentry CLI. `release` = frontend version from git.
- `packages/browser-extension`: `@sentry/browser` in service worker +
  content scripts. `release` = extension version from manifest.
- `packages/cli`: `@sentry/node`. `release` = CLI package version.

All four use the same Sentry project so issues are grouped across surfaces
and one webhook covers everything. The `release` tag is how Sentry decides
"regression" (was this resolved in an earlier release and now back?).

### Triage route — `packages/back/routes/sentry-webhook.js`

Single Express handler. Pipeline:

```
verify HMAC → parse event → in denylist? → below threshold?
   → already in flight? → cap exceeded? → dispatch to GitHub
```

Each step is a pure function except the last. Each returns a "skip reason"
string so log entries explain *why* an event was dropped — essential for
tuning the denylist.

HTTP responses:

- 200 with skip reason for filtered/dropped events (Sentry won't retry).
- 200 with dispatch info for successful dispatches.
- 401 for bad signature.
- 500 for transient downstream failures (GH API, etc.) so Sentry retries.

### Denylist + threshold config — `packages/back/config/sentry-triage.js`

Checked into the repo. Plain JS module:

```js
module.exports = {
  denylist: [
    { type: 'http_status', match: [404, 401, 403] },
    { type: 'message_regex', match: /ECONNRESET/ },
    { type: 'logger_name', match: 'access-log' },
    // grows as noise is observed
  ],
  thresholds: {
    minEvents: 5,
    minTimeWindow: '1h',
  },
  rateLimit: {
    maxInFlight: 3,
    maxDispatchesPerDay: 10,
  },
}
```

Changes go through PR review. No DB, no admin UI for v1.

### GitHub dispatcher — `packages/back/services/github-dispatch.js`

Thin wrapper over `@octokit/rest`. Three methods:

```js
findOpenForSentryIssue(sentryId)
  // GH search: is:issue|pr is:open label:sentry:<id>
findPriorAttempts(sentryId)
  // GH search: is:issue is:closed label:sentry:<id>, returns linked merged PRs
createTriageIssue(sentryEvent, priorAttempts)
  // issue with labels [sentry:<id>, sentry-fix], body with Sentry URL,
  // event JSON, and a "Prior attempts" section listing earlier PRs
triggerFixWorkflow(issueNumber)
  // workflow_dispatch with issue_number input
```

Uses a fine-scoped GitHub App installation token (not a PAT). The App handles
its own rate limits and the token is short-lived.

### Fix workflow — `.github/workflows/sentry-fix.yml`

Triggered by `workflow_dispatch` with `issue_number` input.

1. Checkout `master`.
2. Read the GH issue body, extract Sentry event JSON + stack trace.
3. Assemble agent context: read each source file referenced in the stack
   trace; bundle with the Sentry event, failing release version, GH issue URL,
   and instructions ("investigate, write a fix, open a draft PR linked to
   the issue, do not auto-merge").
4. Run `anthropics/claude-code-action` with that prompt and a checkout-write
   permissioned token from the GitHub App.
5. Action opens the draft PR. Railway auto-deploys a preview.
6. If the agent finishes without opening a PR (couldn't find a fix, decided
   it shouldn't), it posts a comment on the issue with its reasoning. The
   issue stays open and continues to count toward `maxInFlight`.

### Resolve-on-merge workflow — `.github/workflows/sentry-resolve.yml`

Triggered by `pull_request: closed` where `merged == true` and the PR has a
`sentry:<id>` label. Two-step:

1. Mark the primary `<id>` resolved via the Sentry API.
2. Parse a fenced ```` ```sentry-also-resolves ```` block from the PR body
   (the PR template asks the agent to list any extra IDs the same fix
   covers); mark each listed ID resolved too.

If any error returns in a future release, Sentry fires `issue.unresolved`
(regression), the same webhook fires, the cycle restarts. Triage will pick
up history of earlier attempts via the "Prior attempts" search in
`createTriageIssue`.

Same workflow handles the close-without-merge path: when a PR with a
`sentry:<id>` label is closed without being merged, it adds a `wont-fix`
label to both the PR's linked issue *and* the Sentry issue. Triage treats
`wont-fix` as a permanent skip until a human removes the label.

### Cap-recovery cron — `.github/workflows/sentry-cron.yml`

Runs hourly. Lists unresolved Sentry issues without an in-flight GH issue,
re-runs triage for each. This handles two cases: dispatches dropped by a
daily cap that has since rolled over, and webhook deliveries that were
missed. With this in place, the system is webhook-driven by default but
self-healing if the webhook is ever unreliable.

## Dedup state machine

Per Sentry issue ID, state is derived from GitHub + Sentry. We store nothing
of our own.

```
                 ┌──────────────────────────────┐
                 │ Sentry: unresolved           │
                 │ GH: no open issue/PR with    │
                 │     label sentry:<id>        │
                 │ → DISPATCH                   │
                 └──────────┬───────────────────┘
                            │ webhook + filters pass
                            ▼
                 ┌──────────────────────────────┐
                 │ Sentry: unresolved           │
                 │ GH: open issue, no PR yet    │
                 │ → SKIP (agent running)       │
                 └──────────┬───────────────────┘
                            │ agent opens draft PR
                            ▼
                 ┌──────────────────────────────┐
                 │ Sentry: unresolved           │
                 │ GH: open draft PR            │
                 │ → SKIP (awaiting human)      │
                 └──────────┬───────────────────┘
                            │
         ┌──────────────────┼──────────────────────────────┐
         │ merge            │ close-without-merge          │ stale > 14 days
         ▼                  ▼                              ▼
   ┌─────────────────┐ ┌─────────────────┐ ┌───────────────────────┐
   │ Sentry resolved │ │ Sentry: ignored │ │ stale-bot closes both │
   │ PR merged       │ │ wont-fix label  │ │ PR + issue            │
   │ → SKIP unless   │ │ → SKIP forever  │ │ → DISPATCH eligible   │
   │   regression    │ │ (override:      │ │   on next occurrence  │
   │                 │ │  remove label)  │ │                       │
   └────────┬────────┘ └─────────────────┘ └───────────────────────┘
            │
            │ Sentry fires "issue.unresolved" (regression)
            ▼
       back to DISPATCH
```

Rules:

- **"In-flight" = any open issue OR open PR with label `sentry:<id>`.**
  One GH search per webhook. No race window worth caring about at our event rate.
- **"Human said no" = closed PR without merge.** Permanent skip via
  `wont-fix` label on both the GH issue and the Sentry issue. Manual
  override = remove the label.
- **"Fix held"** = PR merged + Sentry has no regression event for the same
  issue ID. If a regression fires, triage will create a new GH issue for
  the same `sentry:<id>`. As part of issue creation, the dispatcher searches
  GitHub for closed issues with the same `sentry:<id>` label and lists them
  (with their linked merged PRs) in a "Prior attempts" section of the new
  issue body. The agent prompt naturally includes this context, so it knows
  earlier fixes didn't hold and can try a different angle. No Sentry-side
  annotation needed — Sentry doesn't have first-class issue labels, so we
  keep history on the GitHub side where labels are native.
- **Stale agent PRs.** Stale-bot config closes draft PRs labelled
  `sentry-fix` after 14 days of no activity. GitHub does *not* auto-close
  linked issues when a PR is closed without merge, so the stale-bot
  configuration explicitly closes both the PR and any issue carrying the
  same `sentry:<id>` label. Frees the dedup slot.

Two scenarios this design intentionally handles:

1. **Same root cause, multiple Sentry IDs.** Sentry sometimes splits one bug
   into multiple issue IDs. The PR template includes a fenced block:
   ```
   ```sentry-also-resolves
   <sentry-id-1>
   <sentry-id-2>
   ```
   ```
   The resolve-on-merge workflow parses this block from the PR body and
   marks each listed ID resolved via the Sentry API, in addition to the
   primary ID from the `sentry:<id>` label. Imperfect but cheap.
2. **Bug introduced by the agent's own merged PR.** New errors after a merge
   get caught by the next webhook tick like any other. No special-casing.

## Cost, rate limits, failure handling

### Cost shape per dispatched fix

- **Claude Code Action run** — one model session per dispatch; dominant cost.
  Capped at `maxDispatchesPerDay: 10`.
- **GitHub Actions minutes** — short workflow; negligible vs. agent time.
- **Railway preview** — per-PR backend + DB, idle most of the time;
  cents-per-hour. Bounded by the 14-day stale-bot cleanup and `maxInFlight: 3`.
- **Sentry** — free tier, 5k events/month. Denylist and threshold serve as
  event-volume hygiene independent of the agent loop.

### Rate limits enforced in triage

- `maxInFlight: 3` — if 3 agent PRs are already open, drop with reason
  `inflight_cap`. Logged at `warn`, not silently swallowed. Human draining
  the queue is the back-pressure.
- `maxDispatchesPerDay: 10` — counted via GH issue search for
  `label:sentry-fix created:>=<today>`. Same back-pressure.
- The cap-recovery cron picks up anything that was capped once the window
  rolls over, so no event is lost — only delayed.

### Failure handling

| Failure | Behaviour |
| --- | --- |
| Webhook signature fails | 401, log `error` (Telegram pings) |
| Sentry payload unparseable | 200 (no retry storm), log `error` with raw payload |
| GH API failure during dispatch | 500, Sentry retries with backoff |
| Agent runs but can't fix | Posts reasoning comment on the GH issue; issue stays open and counts toward `maxInFlight` until human closes/labels it |
| Agent's PR is broken | Caught by human review — preview being broken is the signal |
| Cap-recovery cron stops | System reverts to webhook-only (still works for new errors + regressions); degrading-not-failing |
| Sentry resolve API call fails | Merge workflow fails loudly, comments on PR with Sentry ID; human resolves manually |

### Runaway protection

`maxInFlight: 3` and `maxDispatchesPerDay: 10` make a runaway loop
structurally impossible. Even if every merged PR triggered a regression, the
cycle is bounded.

## Testing approach

### Unit tests (`packages/back/test/tests/sentry-triage/`)

Highest-leverage tests. Each triage step is a pure function — all small and fast.

- **Denylist matcher** — Table-driven: (event, denylist config, expected
  match reason). Covers each `type` and the "no match" case.
- **Threshold check** — Synthetic events with varying `event_count`,
  `firstSeen`, `lastSeen`. Boundary cases at minEvents and time window edges.
- **Dedup query** — Mocked Octokit search responses. Cases: no results
  → dispatch; open issue → skip; open PR → skip; closed-without-merge PR
  with `wont-fix` → skip; merged PR with no regression → skip; merged PR
  with `claude-fix-failed` → dispatch.
- **Pipeline integration** — Composed pipeline with denylisted /
  under-threshold / in-flight / clean events. Confirms only the clean one
  calls the dispatcher.

Runs in CI on every PR.

### Integration test (`packages/back/test/tests/sentry-webhook.js`)

One happy-path test:

1. Backend up with stubbed Octokit.
2. POST a fixture Sentry webhook with a valid signature.
3. Assert: GH issue created with the right label/body/Sentry context;
   `workflow_dispatch` called with the issue number.

Plus three negative tests: bad signature → 401; denylisted event → 200 +
no dispatch; in-flight event → 200 + no dispatch (skip reason in body).

### Manual smoke tests (runbook, not CI)

The fix workflow runs against real GitHub, Railway, Sentry. We don't try to
test that in CI. Bring-up procedure:

1. **Synthetic Sentry issue**: feature-flagged trivial bug in production.
   Confirm full chain: Sentry → webhook → GH issue → workflow → draft PR
   → Railway preview.
2. **Synthetic regression**: revert the synthetic fix; confirm Sentry fires
   `issue.unresolved` and the cycle restarts.
3. **Synthetic wont-fix**: close the agent's PR without merge; confirm next
   occurrence does not redispatch.

### What we deliberately don't test

- Agent fix quality — human's job at PR review. Asserting model output in
  CI would couple us to model behaviour.
- Railway's preview deploy — if Railway is broken, the existing
  `pr-demo.yml` pipeline is broken too; not this system's scope.

## Out of scope for v1

- Automatic regression-test generation by the agent.
- Two-tier auto-vs-manual dispatch policy.
- Admin UI for denylist; lives in repo config only.
- Auto-merge of agent PRs.
- Performance / profiling instrumentation in Sentry (errors only).
- Cross-repo coverage; this system covers the fomoplayer monorepo only.

## Open questions for implementation

These are intentionally deferred to the implementation plan rather than
decided up front. Each is a concrete decision to make during implementation,
not a design ambiguity.

- Which exact GitHub Action implements the agent step
  (`anthropics/claude-code-action` vs alternative). The integration
  surface — `workflow_dispatch` input, output PR — is the same regardless.
- GitHub App vs PAT for the dispatcher token (App preferred; PAT acceptable
  for v0 spike).
- Initial denylist contents — should be derived from the first week of
  real Sentry data after instrumentation lands, not guessed.
- Whether the cap-recovery cron should batch dispatches or fire one at a
  time. Default: one at a time, respecting `maxInFlight`.

## Bring-up sequence

Recommended order for the implementation plan to follow:

1. Add Sentry SDKs to all four packages; verify events reach Sentry from
   each surface.
2. Collect a week of real Sentry data; use it to seed the initial denylist.
3. Build triage route + denylist module + dispatcher; gate behind a
   feature flag so it can ship before any agent wiring.
4. Add the GH issue creation step but not the workflow_dispatch; verify
   issues land with the right shape.
5. Add the fix workflow and the GitHub App; dispatch only on a manual test
   issue first.
6. Add the resolve-on-merge workflow.
7. Add the cap-recovery cron.
8. Enable the webhook trigger for real Sentry events.

Each step is independently shippable and reversible.
