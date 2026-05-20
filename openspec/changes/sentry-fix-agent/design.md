## Context

Production errors in Fomo Player today are caught by users, not by us.
There is no shared error pipeline across the four runtime surfaces
(`packages/back`, `packages/front`, `packages/browser-extension`,
`packages/cli`), and no mechanical link between an error and a code fix.

The spec referenced by this change
(`docs/superpowers/specs/2026-05-19-sentry-triage-fix-agent-design.md`)
proposes a webhook-driven loop: Sentry catches errors, a backend route
filters them, a GitHub workflow runs a coding agent to open a draft PR,
Railway preview-deploys it, a human reviews and merges, and a second
workflow marks the Sentry issue resolved. GitHub + Sentry hold the state;
the backend triage route is the only mutable code we add.

Constraints that shape the design:

- The project's no-hardcoded-URLs / no-hardcoded-deployment-hosts policy
  (see `CLAUDE.md`) means DSNs and external API hosts must come from
  configuration, never from string literals.
- Existing Railway preview pipeline (`pr-demo.yml`) already auto-deploys
  any PR, draft included, so we get human-reviewable previews for free.
- The user runs Sentry's free tier (5k events / month), so denylist +
  threshold filtering must do real work — both for event-volume hygiene
  and for agent cost.
- Cost dominator is the coding-agent run itself, not GitHub Actions
  minutes or Railway preview hours.

Stakeholders: solo maintainer reviewing draft PRs and merging fixes;
Sentry SaaS as event source; GitHub as state store and CI runtime;
Railway as preview host.

## Goals / Non-Goals

**Goals:**

- Get from "Sentry sees the error" to "draft PR with a candidate fix"
  without human action.
- Keep the system stateless: every persistent fact lives in Sentry,
  GitHub, or the codebase. No new database, no admin UI in v1.
- Make every "skip" (denylist, threshold, dedup, cap) explainable from
  logs so the denylist can be tuned over time.
- Make a runaway loop structurally impossible via in-flight and
  daily-dispatch caps.
- Keep human judgement at the merge gate. The agent never auto-merges.
- Ship in independently shippable steps so we can pull the lever back at
  any stage of bring-up.

**Non-Goals:**

- Auto-generating regression tests from Sentry events. (v2.)
- Two-tier auto-vs-manual dispatch policy. (v2.)
- Admin UI for the denylist. PR review is the editing surface.
- Auto-merging agent PRs.
- Sentry performance monitoring, profiling, session replay, or tracing.
  Errors only.
- Covering repos outside this monorepo.

## Decisions

### Single Sentry project across all four runtimes

All four packages report into one Sentry project. Sentry's grouping then
covers cross-surface bugs (e.g. an extension and front-end sharing a
shared-package regression). One webhook subscription drives the whole
loop.

Alternatives considered:
- One project per package. Cleaner separation but four webhooks, four
  denylist configs, no cross-surface grouping. Rejected — operational
  cost outweighs the marginal isolation.

### Webhook-driven with hourly cap-recovery cron

The primary trigger is Sentry's `issue.created` and `issue.unresolved`
webhooks. A `sentry-cron.yml` workflow runs hourly and replays triage for
any unresolved Sentry issue without an in-flight GH issue.

This is the simplest design that's robust to:
- A daily cap dropping events that should be retried tomorrow.
- A missed webhook delivery (Sentry retries are best-effort).
- Regressions that fire after a merge: Sentry's own regression detection
  fires `issue.unresolved` and the webhook path picks it up.

Alternatives considered:
- Polling-only. Simpler to reason about (no webhook secret, no HMAC) but
  delays detection-to-dispatch by up to an hour every time. Rejected.
- Webhook-only with no cron. Loses events on cap rollover and missed
  deliveries. Rejected.

### GitHub + Sentry as the only state stores

Per-issue state is derived from two queries: a Sentry "is this resolved?"
check and a GitHub "is there an open issue or PR with label
`sentry:<id>`?" search. No DB, no Redis, no Sentry tags we maintain
ourselves.

Trade-off: each webhook does ~2 GitHub API calls (search + issue create)
and one Sentry API call. At our event rate (capped at 10 dispatches/day
plus filtered traffic), this is negligible against either provider's
rate limits.

Alternatives considered:
- Local `triage_state` table in Postgres. Adds an availability dependency
  (if Postgres is down, triage fails) and a migration surface for state
  shape changes. Rejected.
- Redis with TTLs for dedup. Lower latency but adds an extra dependency
  for a low-frequency code path. Rejected.

### Labels as the source of truth

- `sentry:<id>` — uniquely binds GH issues, PRs, and Sentry IDs together.
- `sentry-fix` — gates rate limits (`maxInFlight`, `maxDispatchesPerDay`)
  and stale-bot scope.
- `wont-fix` — permanent skip. Removing it re-enables dispatch.

Labels are GH-native, queryable via the search API, and visible in the GH
UI. No structured-comment parsing required for the common dedup path.

The one exception is the `sentry-also-resolves` fenced block in the PR
body, used only at resolve time to fan out to extra Sentry IDs. This is
free-form text because we need to capture an arbitrary list of IDs at
merge time, which labels don't model well.

### Filter pipeline as pure functions

Each filter (denylist, threshold, dedup, rate-limit) is a pure function
that returns either `pass` or `{ skip, reason, log }`. The route
composes them in order. Two reasons:

1. Every step is unit-testable in isolation. The dedup query is the only
   one with external dependencies, and that's a thin Octokit wrapper.
2. Skip reasons become first-class logs. Querying logs for skip-reason
   distribution tells us which filters to tune next.

### Agent action wired by `workflow_dispatch` with `issue_number`

The contract between triage and the agent is two values: a GH issue
number and an issue body. The issue body holds everything the agent
needs (event JSON, source file paths, prior attempts). This:

- Decouples triage from the choice of coding agent. Today it's
  `anthropics/claude-code-action`; tomorrow another action with the same
  `issue_number` input slots in.
- Keeps the agent's prompt in version-controlled YAML, not in JS string
  literals.

### GitHub App over PAT

A scoped App installation token is short-lived, app-rate-limited, and
revocable without rotating a human's PAT. PAT is acceptable for the v0
spike (single-day window for the first synthetic test) but not for
sustained use.

Permissions required on the App: `issues:write`, `pull-requests:write`,
`contents:write` (for the agent checkout), `actions:write` (for
`workflow_dispatch`).

### Errors-only, no perf monitoring in v1

Adding tracing/profiling/replay would multiply Sentry event volume and
push us off the free tier. The agent loop doesn't need any of it; the
stack trace plus event extras is enough context.

## Risks / Trade-offs

| Risk | Mitigation |
| --- | --- |
| Agent opens a broken PR that looks plausible | Railway preview being broken is the signal. Human reviews the preview before merging. Caps bound the blast radius if it goes wrong. |
| Sentry sometimes groups one root cause into multiple IDs | `sentry-also-resolves` fenced block in the PR body lets a single merged PR close additional IDs in Sentry. Imperfect but cheap. |
| Fix doesn't hold; regression fires | Sentry emits `issue.unresolved`, webhook re-fires, dispatcher writes a "Prior attempts" section into the new issue body so the agent sees that earlier fixes didn't work. |
| Runaway dispatch loop (e.g. agent's PR introduces a new error) | `maxInFlight: 3` and `maxDispatchesPerDay: 10` make this structurally bounded. New errors get caught by the next webhook tick — no special-casing. |
| Stale draft PRs occupy dedup slots indefinitely | Stale-bot closes draft `sentry-fix` PRs after 14 days, and explicitly closes the linked issue too (GitHub doesn't auto-close linked issues when a PR closes without merge). |
| Webhook secret leaks | Rotation via Sentry + env var update; HMAC verification ensures unsigned traffic is rejected with `401`. |
| Sentry resolve API call fails on merge | Resolve workflow fails loudly with a PR comment naming the Sentry IDs that need manual resolution. Worse case: a tiny manual chore once in a blue moon. |
| Cap-recovery cron stops running | System reverts to webhook-only; still works for new errors and regressions, only loses cap-rollover replays. Degrading, not failing. |
| Initial denylist guesses are wrong | Bring-up sequence collects a week of real Sentry data before turning on the dispatcher. PR-reviewable config makes tuning easy. |
| Agent receives oversized context (large stack-trace source files) | Workflow truncates per-file content to a configurable byte budget before assembling the prompt. Truncation is documented in the issue body so reviewers see when context was clipped. |
| Free-tier Sentry event quota exhausted | Denylist + threshold serve as event-volume hygiene independently of the agent loop. If quota is still hit, the system fails open (no events trigger dispatch). |

## Migration Plan

This is greenfield instrumentation — no existing Sentry or agent system
to migrate. Bring-up is staged so each step is independently shippable
and reversible:

1. Add Sentry SDKs to all four packages with `release` tags. Verify
   events reach Sentry from each surface using a deliberate test error
   (e.g., a one-line throw behind a query-param feature flag).
2. Collect a week of real Sentry data; use it to seed the initial
   denylist + thresholds in `packages/back/config/sentry-triage.js`.
3. Build triage route + denylist module + dispatcher; gate the entire
   route behind a `TRIAGE_ENABLED` env-var flag so it can ship dark.
4. Add GH issue creation step only — no `workflow_dispatch` yet. Verify
   issues land with the right labels, body, and `Prior attempts`
   section. Open and close a few by hand to verify dedup.
5. Add the fix workflow (`sentry-fix.yml`) plus GitHub App. Dispatch
   only on a manual test issue first.
6. Add the resolve-on-merge workflow (`sentry-resolve.yml`). Verify
   merge and close-without-merge paths against a real (synthetic) PR.
7. Add the cap-recovery cron (`sentry-cron.yml`).
8. Flip `TRIAGE_ENABLED=true` for real Sentry events.

Rollback: at any step, disable `TRIAGE_ENABLED` or remove the Sentry
webhook subscription. Existing Sentry events accumulate as usual; the
agent loop simply stops.

## Open Questions

These are deferred to implementation, not blockers on the design:

- Exact coding-agent action — `anthropics/claude-code-action` vs.
  alternative. The `workflow_dispatch` input / draft-PR output contract
  is the same regardless.
- GitHub App vs. PAT for the dispatcher token. App preferred; PAT
  acceptable for the v0 synthetic-error spike.
- Initial denylist contents — to be seeded from the first week of real
  Sentry data, not guessed in advance.
- Whether the cap-recovery cron batches dispatches or fires one at a
  time. Default: one at a time, respecting `maxInFlight`.
- Per-file byte budget for stack-trace source file inlining in the
  prompt. Default: 8 KB per file, configurable in workflow YAML.
- Whether Sentry's notion of "wont-fix" should be encoded as a Sentry
  issue tag, an inbox-state ignore, or both. To be confirmed against
  Sentry API capabilities during step 6.
