'use strict'

// POST /api/sentry-webhook
//
// Sentry-integration webhook for `issue.created` and `issue.unresolved`
// events. The route verifies the request HMAC, runs the filter pipeline
// (denylist → threshold → in-flight dedup → wont-fix → in-flight cap →
// daily-dispatch cap), and on pass creates a triage GH issue + dispatches
// the sentry-fix workflow.
//
// Ship-dark by default: when TRIAGE_ENABLED !== 'true', every request
// short-circuits with skip reason `triage_disabled`.

const crypto = require('crypto')
const express = require('express')
const expressPromiseRouter = require('express-promise-router')
const defaultLogger = require('fomoplayer_shared').logger(__filename)

const {
  denylistMatch,
  belowThreshold,
  composePipeline,
} = require('../services/sentry-triage/filters')
const defaultTriageConfig = require('../config/sentry-triage')
const { createDispatcher } = require('../services/github-dispatch')

const SIGNATURE_HEADERS = ['sentry-hook-signature', 'x-sentry-signature']
const HOOK_RESOURCE_HEADER = 'sentry-hook-resource'

const SUPPORTED_RESOURCES = new Set(['issue'])
const SUPPORTED_ACTIONS = new Set(['created', 'unresolved'])

const verifySignature = (rawBody, header, secret) => {
  if (!header || typeof header !== 'string') return false
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex')
  const given = header.startsWith('sha256=') ? header.slice(7) : header
  if (given.length !== expected.length) return false
  try {
    return crypto.timingSafeEqual(Buffer.from(given, 'hex'), Buffer.from(expected, 'hex'))
  } catch (_) {
    return false
  }
}

const readSignature = (req) => {
  for (const name of SIGNATURE_HEADERS) {
    const value = req.headers[name]
    if (value) return value
  }
  return undefined
}

const sentryIdFor = (event) => event?.data?.issue?.id || event?.issue?.id

const createSentryWebhookRouter = ({
  triageConfig = defaultTriageConfig,
  webhookSecret = process.env.SENTRY_WEBHOOK_SECRET,
  triageEnabled = process.env.TRIAGE_ENABLED === 'true',
  buildDispatcher = createDispatcher,
  logger = defaultLogger,
  now = () => new Date(),
} = {}) => {
  const router = expressPromiseRouter()

  // Raw-body parser so HMAC verification matches the exact bytes Sentry
  // signed; bodyParser.json() would otherwise re-stringify and break the
  // signature check on round-trip whitespace differences.
  router.use(express.raw({ type: 'application/json', limit: '1mb' }))

  router.post('/', async (req, res) => {
    if (!webhookSecret) {
      logger.error('Sentry webhook misconfigured: SENTRY_WEBHOOK_SECRET unset')
      return res.status(500).json({ status: 'error', message: 'webhook misconfigured' })
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body : Buffer.from('')
    const signature = readSignature(req)
    if (!verifySignature(rawBody, signature, webhookSecret)) {
      logger.error('Sentry webhook signature mismatch', { signature_present: Boolean(signature) })
      return res.status(401).json({ status: 'error', message: 'invalid signature' })
    }

    let event
    try {
      event = JSON.parse(rawBody.toString('utf8'))
    } catch (e) {
      logger.error('Sentry webhook body is not valid JSON', { raw: rawBody.toString('utf8').slice(0, 500) })
      return res.status(200).json({ status: 'skip', skip: 'invalid_payload' })
    }

    const resource = (req.headers[HOOK_RESOURCE_HEADER] || '').toString().toLowerCase()
    const action = (event.action || event.event || '').toString().toLowerCase()
    if (resource && !SUPPORTED_RESOURCES.has(resource)) {
      return res.status(200).json({ status: 'skip', skip: `unsupported_resource:${resource}` })
    }
    if (!SUPPORTED_ACTIONS.has(action)) {
      return res.status(200).json({ status: 'skip', skip: `unsupported_action:${action || 'missing'}` })
    }

    const sentryId = sentryIdFor(event)
    if (!sentryId) {
      logger.error('Sentry webhook payload missing issue id', { action })
      return res.status(200).json({ status: 'skip', skip: 'missing_sentry_id' })
    }

    if (!triageEnabled) {
      logger.info('Sentry webhook received but triage disabled', { sentry_id: sentryId, action })
      return res.status(200).json({ status: 'skip', skip: 'triage_disabled', sentry_id: sentryId })
    }

    let dispatcher
    try {
      dispatcher = await buildDispatcher()
    } catch (e) {
      logger.error('Sentry webhook: failed to construct GitHub dispatcher', { error: e?.message })
      return res.status(500).json({ status: 'error', message: 'dispatcher_init_failed' })
    }

    // In-flight dedup, wont-fix, and rate-limit filters depend on GitHub
    // state, so they're stateful — implement inline instead of in the pure
    // filters module.
    const githubFilters = [
      async () => {
        const existing = await dispatcher.findOpenForSentryIssue(sentryId)
        return existing ? { reason: 'inflight' } : null
      },
      async () => {
        const wontFix = await dispatcher.hasWontFix(sentryId)
        return wontFix ? { reason: 'wont_fix' } : null
      },
      async () => {
        const inFlight = await dispatcher.countInFlightFixPRs()
        if (inFlight >= triageConfig.rateLimit.maxInFlight) {
          return { reason: 'inflight_cap', count: inFlight, cap: triageConfig.rateLimit.maxInFlight }
        }
        return null
      },
      async () => {
        const today = await dispatcher.countTodayDispatches(now())
        if (today >= triageConfig.rateLimit.maxDispatchesPerDay) {
          return { reason: 'daily_dispatch_cap', count: today, cap: triageConfig.rateLimit.maxDispatchesPerDay }
        }
        return null
      },
    ]

    const pureSkip = composePipeline([denylistMatch, belowThreshold])(event, triageConfig)
    if (pureSkip.skip) {
      const logLevel = pureSkip.reason.startsWith('denylist:') ? 'info' : 'info'
      logger[logLevel]('Sentry triage skip', {
        sentry_id: sentryId,
        skip: pureSkip.reason,
        action,
      })
      return res.status(200).json({ status: 'skip', skip: pureSkip.reason, sentry_id: sentryId })
    }

    for (const filter of githubFilters) {
      try {
        const result = await filter()
        if (result) {
          const isCap = result.reason === 'inflight_cap' || result.reason === 'daily_dispatch_cap'
          logger[isCap ? 'warn' : 'info']('Sentry triage skip', {
            sentry_id: sentryId,
            skip: result.reason,
            action,
            ...(result.count !== undefined ? { count: result.count, cap: result.cap } : {}),
          })
          return res.status(200).json({ status: 'skip', skip: result.reason, sentry_id: sentryId })
        }
      } catch (e) {
        const status = e?.status || e?.response?.status
        if (status && status >= 500) {
          logger.error('Sentry triage: GitHub 5xx, asking Sentry to retry', { sentry_id: sentryId, error: e?.message, status })
          return res.status(500).json({ status: 'error', message: 'github_5xx' })
        }
        logger.error('Sentry triage filter threw', { sentry_id: sentryId, error: e?.message })
        return res.status(500).json({ status: 'error', message: 'filter_error' })
      }
    }

    let priorAttempts = []
    try {
      priorAttempts = await dispatcher.findPriorAttempts(sentryId)
    } catch (e) {
      logger.warn('Sentry triage: prior-attempts lookup failed; continuing without them', {
        sentry_id: sentryId,
        error: e?.message,
      })
    }

    try {
      const issue = await dispatcher.createTriageIssue(event, priorAttempts)
      await dispatcher.triggerFixWorkflow(issue.number)
      logger.info('Sentry triage dispatched', { sentry_id: sentryId, issue_number: issue.number })
      return res.status(200).json({ status: 'ok', sentry_id: sentryId, issue_number: issue.number, issue_url: issue.url })
    } catch (e) {
      const status = e?.status || e?.response?.status
      if (status && status >= 500) {
        logger.error('Sentry triage: GitHub 5xx on create/dispatch', { sentry_id: sentryId, error: e?.message, status })
        return res.status(500).json({ status: 'error', message: 'github_5xx' })
      }
      logger.error('Sentry triage: dispatch failed', { sentry_id: sentryId, error: e?.message, status })
      return res.status(500).json({ status: 'error', message: 'dispatch_failed' })
    }
  })

  return router
}

module.exports = createSentryWebhookRouter
module.exports.createSentryWebhookRouter = createSentryWebhookRouter
module.exports.verifySignature = verifySignature
