'use strict'

// Pure-function filter pipeline for the Sentry triage webhook.
//
// Each filter takes (event, config) and returns either:
//   null                                       → pass, move to the next filter
//   { reason: '<stable-code>' }                → skip, with a stable skip code
// Composition runs filters in order and short-circuits on first skip.
//
// Stable skip codes (per sentry-triage-webhook spec):
//   denylist:<rule-name>, below_threshold, inflight, wont_fix,
//   inflight_cap, daily_dispatch_cap

const ruleName = (rule) => {
  if (rule.name) return rule.name
  const matchStr = Array.isArray(rule.match) ? rule.match.join(',') : String(rule.match)
  return `${rule.type}:${matchStr}`
}

// Sentry webhook payloads come in two flavours (issue-level and event-level).
// These helpers tolerate both shapes plus normalised test fixtures.
const extractHttpStatus = (event) => {
  if (!event || typeof event !== 'object') return undefined
  if (typeof event.http_status === 'number') return event.http_status
  const ev = event.event || event.data?.event
  if (ev) {
    const fromContext = ev.contexts?.response?.status_code
    if (typeof fromContext === 'number') return fromContext
    const tagsAsArray = Array.isArray(ev.tags) ? Object.fromEntries(ev.tags) : ev.tags
    if (tagsAsArray) {
      const raw = tagsAsArray.http_status ?? tagsAsArray['http.status_code']
      const parsed = Number.parseInt(raw, 10)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return undefined
}

const extractMessage = (event) => {
  if (!event || typeof event !== 'object') return ''
  if (typeof event.message === 'string') return event.message
  const ev = event.event || event.data?.event
  if (!ev) return ''
  if (typeof ev.message === 'string' && ev.message.length > 0) return ev.message
  const value = ev.exception?.values?.[0]?.value
  if (typeof value === 'string') return value
  return ''
}

const extractLoggerName = (event) => {
  if (!event || typeof event !== 'object') return ''
  if (typeof event.logger === 'string') return event.logger
  const ev = event.event || event.data?.event
  if (!ev) return ''
  return typeof ev.logger === 'string' ? ev.logger : ''
}

const matchValue = (match, value) => {
  if (Array.isArray(match)) return match.includes(value)
  return match === value
}

const matchRegex = (match, value) => {
  if (typeof value !== 'string') return false
  const patterns = Array.isArray(match) ? match : [match]
  return patterns.some((pattern) => {
    try {
      return new RegExp(pattern).test(value)
    } catch (_) {
      return false
    }
  })
}

const ruleMatches = (rule, event) => {
  switch (rule.type) {
    case 'http_status': {
      const status = extractHttpStatus(event)
      return status !== undefined && matchValue(rule.match, status)
    }
    case 'message_regex':
      return matchRegex(rule.match, extractMessage(event))
    case 'logger_name': {
      const logger = extractLoggerName(event)
      return logger.length > 0 && matchValue(rule.match, logger)
    }
    default:
      // Unknown rule types do not match. Surface them through the config
      // shape test rather than failing the pipeline at runtime.
      return false
  }
}

const denylistMatch = (event, config) => {
  const rules = config?.denylist || []
  for (const rule of rules) {
    if (ruleMatches(rule, event)) {
      return { reason: `denylist:${ruleName(rule)}` }
    }
  }
  return null
}

// Threshold check: event passes only if the issue has ≥ minEvents in the
// last minTimeWindowMs (measured from now). Uses Sentry-supplied
// `event_count`, `firstSeen`, `lastSeen` (issue stats included on issue
// webhook payloads).
const extractIssueStats = (event) => {
  const issue = event?.issue || event?.data?.issue || {}
  const eventCount =
    Number.parseInt(
      issue.count ?? issue.eventCount ?? event?.event_count ?? event?.count ?? '0',
      10,
    ) || 0
  const firstSeen = issue.firstSeen || event?.firstSeen
  const lastSeen = issue.lastSeen || event?.lastSeen
  return { eventCount, firstSeen, lastSeen }
}

const belowThreshold = (event, config, now = Date.now()) => {
  const { minEvents, minTimeWindowMs } = config?.thresholds || {}
  const { eventCount, firstSeen, lastSeen } = extractIssueStats(event)

  if (typeof minEvents === 'number' && eventCount < minEvents) {
    return { reason: 'below_threshold' }
  }

  if (typeof minTimeWindowMs === 'number' && minTimeWindowMs > 0 && firstSeen) {
    const firstSeenMs = Date.parse(firstSeen)
    if (Number.isFinite(firstSeenMs)) {
      const lastSeenMs = lastSeen ? Date.parse(lastSeen) : now
      const windowStart = (Number.isFinite(lastSeenMs) ? lastSeenMs : now) - minTimeWindowMs
      // Issue's first occurrence must precede the window AND the issue must
      // still be active recently (last seen within the window).
      if (firstSeenMs > windowStart) {
        return { reason: 'below_threshold' }
      }
    }
  }

  return null
}

// composePipeline returns a function (event, config) -> { skip: false } | { skip: true, reason }
// Filters run in order; the first one returning a non-null result short-circuits.
const composePipeline = (filters) => {
  if (!Array.isArray(filters)) throw new TypeError('composePipeline expects an array of filter functions')
  return (event, config) => {
    for (const filter of filters) {
      const result = filter(event, config)
      if (result) {
        return { skip: true, reason: result.reason, filter: filter.name || 'anonymous' }
      }
    }
    return { skip: false }
  }
}

module.exports = {
  denylistMatch,
  belowThreshold,
  composePipeline,
  // Exported for callers that need the same extractors when building log lines.
  extractHttpStatus,
  extractMessage,
  extractLoggerName,
  extractIssueStats,
}
