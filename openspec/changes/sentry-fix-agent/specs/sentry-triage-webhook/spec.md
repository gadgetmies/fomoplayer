## ADDED Requirements

### Requirement: HMAC-verified Sentry webhook endpoint

The backend SHALL expose a `POST /api/sentry-webhook` route that accepts
Sentry webhook deliveries for `issue.created` and `issue.unresolved`
events. The route SHALL verify the request HMAC signature against
`SENTRY_WEBHOOK_SECRET` before any other processing.

#### Scenario: Valid signature is accepted

- **WHEN** Sentry POSTs a webhook with a body matching its HMAC signature
  using `SENTRY_WEBHOOK_SECRET`
- **THEN** the route proceeds to the filter pipeline

#### Scenario: Invalid signature is rejected

- **WHEN** Sentry POSTs a webhook with a body that does not match its HMAC
  signature
- **THEN** the route responds `401` and the failure is logged at `error`
  severity

#### Scenario: Unparseable payload does not trigger retry storm

- **WHEN** the request body is structurally invalid JSON or missing
  required fields after a valid signature check
- **THEN** the route responds `200` (no Sentry retry), logs `error` with
  the raw payload, and performs no dispatch

### Requirement: Configurable filter pipeline

Triage SHALL apply a pipeline of pure-function filters in order, and each
SHALL return a skip reason that is included in structured logs:

1. denylist match (event type / HTTP status / message regex / logger name)
2. threshold (`minEvents`, `minTimeWindow`)
3. in-flight dedup (open GH issue or PR with label `sentry:<id>`)
4. permanent skip (`wont-fix` label on GH or Sentry issue)
5. rate limits (`maxInFlight`, `maxDispatchesPerDay`)

The denylist, thresholds, and rate-limit values SHALL be defined in a
checked-in JS config module at
`packages/back/config/sentry-triage.js`. Changes go through PR review;
there SHALL NOT be an admin UI or runtime config endpoint for v1.

#### Scenario: Denylisted event is dropped

- **WHEN** an event matches an entry in the denylist (e.g. HTTP `404`,
  `ECONNRESET` message, `access-log` logger)
- **THEN** the route responds `200`, includes the skip reason in the
  response body, logs at `info`, and performs no dispatch

#### Scenario: Below-threshold event is dropped

- **WHEN** the Sentry issue has fewer than `minEvents` occurrences within
  `minTimeWindow`
- **THEN** the route responds `200` with skip reason `below_threshold` and
  performs no dispatch

#### Scenario: In-flight event is dropped

- **WHEN** a GitHub search finds an open issue OR open PR with label
  `sentry:<id>`
- **THEN** the route responds `200` with skip reason `inflight` and
  performs no dispatch

#### Scenario: Permanent wont-fix event is dropped

- **WHEN** any GH issue or PR carrying label `sentry:<id>` also carries
  label `wont-fix`, OR the Sentry issue itself carries a `wont-fix`
  annotation
- **THEN** the route responds `200` with skip reason `wont_fix` and
  performs no dispatch

#### Scenario: In-flight cap is enforced

- **WHEN** the count of open PRs with label `sentry-fix` is at or above
  `maxInFlight`
- **THEN** the route responds `200` with skip reason `inflight_cap`, logs
  at `warn` severity (so the cap breach is visible), and performs no
  dispatch

#### Scenario: Daily dispatch cap is enforced

- **WHEN** the count of GH issues with label `sentry-fix` created since
  the start of the current day is at or above `maxDispatchesPerDay`
- **THEN** the route responds `200` with skip reason
  `daily_dispatch_cap`, logs at `warn` severity, and performs no
  dispatch

### Requirement: GitHub dispatch on pass

When all filters pass, the triage route SHALL:

1. Create a GitHub issue with labels `sentry:<id>` and `sentry-fix`. The
   issue body SHALL contain the Sentry issue URL, the Sentry event JSON,
   and a `Prior attempts` section listing every closed GH issue with the
   same `sentry:<id>` label and the merged PRs linked from those issues.
2. Call `workflow_dispatch` on `.github/workflows/sentry-fix.yml` with the
   newly created issue number as input.

The dispatcher SHALL authenticate using a GitHub App installation token
(PAT acceptable only for v0 spike).

#### Scenario: Clean event is dispatched

- **WHEN** a Sentry webhook event passes every filter
- **THEN** a GH issue is created with labels `sentry:<id>` and
  `sentry-fix`, its body contains the Sentry URL plus event JSON plus a
  `Prior attempts` section (possibly empty), `workflow_dispatch` is
  called on `sentry-fix.yml` with the new issue number, and the route
  responds `200` with the issue number in the response body

#### Scenario: Prior attempts are surfaced for a recurring issue

- **WHEN** dispatch occurs for a `sentry:<id>` that has two previously
  closed GH issues, one with a merged PR and one without
- **THEN** the new issue body's `Prior attempts` section lists both
  closed issues and links the merged PR from the first

#### Scenario: Transient GitHub API failure causes Sentry retry

- **WHEN** the GitHub API returns a 5xx during issue creation or workflow
  dispatch
- **THEN** the route responds `500` so Sentry retries with backoff, and
  the failure is logged at `error` severity

### Requirement: Skip reasons surfaced in logs

Every skip path SHALL emit a structured log entry containing the Sentry
issue ID, the skip reason (one of the documented codes), and the event
type. Skip reasons SHALL use stable codes from this set:
`denylist:<rule>`, `below_threshold`, `inflight`, `wont_fix`,
`inflight_cap`, `daily_dispatch_cap`.

#### Scenario: Skip reasons usable for denylist tuning

- **WHEN** a log aggregator queries triage logs for the last 7 days
- **THEN** every skip is attributable to one of the documented codes so
  operators can see which filter is doing the most work and tune
  accordingly
