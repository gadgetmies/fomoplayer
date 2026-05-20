'use strict'

// Sentry triage configuration: denylist, thresholds, and rate limits used by
// the /api/sentry-webhook filter pipeline.
//
// This file is the editing surface for triage tuning. Changes go through PR
// review (per the design: "PR review is the editing surface", "no admin UI
// or runtime config endpoint for v1").
//
// Denylist rule shape:
//   { type: 'http_status', match: 404 }
//   { type: 'http_status', match: [400, 401, 403, 404] }
//   { type: 'message_regex', match: '^ECONNRESET' }
//   { type: 'logger_name', match: 'morgan' }
//   { type: 'logger_name', match: ['morgan', 'access-log'] }
//
// Every rule also accepts an optional `name` (used in skip-reason logs as
// `denylist:<name>`). Default name is `<type>:<match>`.
//
// Thresholds are coarse: an event passes only if the Sentry issue has at
// least `minEvents` occurrences within `minTimeWindowMs` of `firstSeen`.
// These mirror Sentry-supplied issue stats and require no extra state.
//
// Rate limits bound runaway-dispatch blast radius:
//   maxInFlight        — open PRs labelled `sentry-fix`
//   maxDispatchesPerDay — GH issues labelled `sentry-fix` created in the
//                        rolling 24h window before "now"

const denylist = [
  // Client-side HTTP errors are noise from spiders, abandoned requests,
  // and unauthenticated probes — none of them indicate a fix-target bug.
  { name: 'http_4xx', type: 'http_status', match: [400, 401, 403, 404] },
  // Connection resets are routine on internet-facing servers and don't
  // identify a bug we can fix in code.
  { name: 'econnreset', type: 'message_regex', match: 'ECONNRESET' },
  // Access-log noise sometimes ends up emitting Sentry events through
  // winston transports; the access log is not actionable.
  { name: 'morgan_access', type: 'logger_name', match: ['morgan', 'access-log'] },
]

const thresholds = {
  // Default seeded conservatively; tune from observed Sentry distribution
  // after the observation-window step (tasks.md §2).
  minEvents: 5,
  minTimeWindowMs: 30 * 60 * 1000, // 30 minutes
}

const rateLimit = {
  maxInFlight: 3,
  maxDispatchesPerDay: 10,
}

module.exports = {
  denylist,
  thresholds,
  rateLimit,
}
