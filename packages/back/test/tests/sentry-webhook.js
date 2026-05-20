'use strict'

// Integration tests for routes/sentry-webhook.js. Builds the route factory
// with a stubbed dispatcher and a fixed config, exercises HMAC, filters,
// and dispatch paths end-to-end through supertest.

const assert = require('assert')
const crypto = require('crypto')
const { test } = require('cascade-test')
const express = require('express')
const supertest = require('supertest')

const createSentryWebhookRouter = require('../../routes/sentry-webhook')

const WEBHOOK_SECRET = 'test-secret-please-rotate'

const sign = (rawBody) =>
  crypto.createHmac('sha256', WEBHOOK_SECRET).update(rawBody).digest('hex')

const silentLogger = () => {
  const calls = []
  const make = (level) => (msg, ctx) => calls.push({ level, msg, ctx })
  return { logger: { info: make('info'), warn: make('warn'), error: make('error'), debug: make('debug') }, calls }
}

const stubDispatcher = (overrides = {}) => {
  const calls = { create: [], dispatch: [] }
  return {
    findOpenForSentryIssue: overrides.findOpenForSentryIssue || (async () => null),
    findPriorAttempts: overrides.findPriorAttempts || (async () => []),
    hasWontFix: overrides.hasWontFix || (async () => false),
    countInFlightFixPRs: overrides.countInFlightFixPRs || (async () => 0),
    countTodayDispatches: overrides.countTodayDispatches || (async () => 0),
    createTriageIssue: overrides.createTriageIssue || (async (event, prior) => {
      calls.create.push({ event, prior })
      return { number: 42, url: 'https://github.com/octo/cat/issues/42' }
    }),
    triggerFixWorkflow: overrides.triggerFixWorkflow || (async (n) => {
      calls.dispatch.push(n)
    }),
    _calls: calls,
  }
}

const triageConfig = {
  denylist: [{ name: 'http_404', type: 'http_status', match: 404 }],
  thresholds: { minEvents: 1, minTimeWindowMs: 0 },
  rateLimit: { maxInFlight: 3, maxDispatchesPerDay: 10 },
}

const buildApp = ({ dispatcher = stubDispatcher(), triageEnabled = true, logger } = {}) => {
  const captured = logger || silentLogger()
  const app = express()
  app.use(
    '/api/sentry-webhook',
    createSentryWebhookRouter({
      triageConfig,
      webhookSecret: WEBHOOK_SECRET,
      triageEnabled,
      buildDispatcher: async () => dispatcher,
      logger: captured.logger,
    }),
  )
  return { app, dispatcher, captured }
}

const baseEvent = (overrides = {}) => ({
  action: 'created',
  data: { issue: { id: 'ABC', title: 'Boom', count: 10, firstSeen: '2026-01-01T00:00:00Z', lastSeen: '2026-01-01T01:00:00Z' } },
  ...overrides,
})

const post = (app, body, { signature, headers = {} } = {}) =>
  supertest(app)
    .post('/api/sentry-webhook/')
    .set('Content-Type', 'application/json')
    .set('Sentry-Hook-Resource', 'issue')
    .set('Sentry-Hook-Signature', signature ?? sign(Buffer.from(body)))
    .set(headers)
    .send(body)

test({
  'sentry-webhook integration': {
    'valid signature + clean event → creates issue and dispatches workflow': async () => {
      const { app, dispatcher } = buildApp()
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.status, 'ok')
      assert.equal(res.body.sentry_id, 'ABC')
      assert.equal(res.body.issue_number, 42)
      assert.equal(dispatcher._calls.create.length, 1)
      assert.equal(dispatcher._calls.dispatch.length, 1)
      assert.equal(dispatcher._calls.dispatch[0], 42)
    },

    'bad signature → 401, no dispatch': async () => {
      const { app, dispatcher } = buildApp()
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body, { signature: 'deadbeef' })
      assert.equal(res.status, 401)
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'denylisted event (http_status 404) → 200 skip denylist, no dispatch': async () => {
      const { app, dispatcher } = buildApp()
      const body = JSON.stringify(
        baseEvent({ data: { issue: { id: 'ABC', count: 10, firstSeen: '2026-01-01T00:00:00Z' }, event: { contexts: { response: { status_code: 404 } } } } }),
      )
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.status, 'skip')
      assert.equal(res.body.skip, 'denylist:http_404')
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'in-flight event (open issue exists) → 200 skip inflight, no dispatch': async () => {
      const dispatcher = stubDispatcher({ findOpenForSentryIssue: async () => ({ number: 99 }) })
      const { app } = buildApp({ dispatcher })
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'inflight')
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'wont-fix event → 200 skip wont_fix, no dispatch': async () => {
      const dispatcher = stubDispatcher({ hasWontFix: async () => true })
      const { app } = buildApp({ dispatcher })
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'wont_fix')
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'in-flight cap reached → 200 skip inflight_cap, logs warn': async () => {
      const dispatcher = stubDispatcher({ countInFlightFixPRs: async () => 3 })
      const captured = silentLogger()
      const { app } = buildApp({ dispatcher, logger: captured })
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'inflight_cap')
      assert.equal(dispatcher._calls.create.length, 0)
      assert.ok(captured.calls.some((c) => c.level === 'warn'), 'inflight_cap should log at warn')
    },

    'daily dispatch cap reached → 200 skip daily_dispatch_cap, logs warn': async () => {
      const dispatcher = stubDispatcher({ countTodayDispatches: async () => 10 })
      const captured = silentLogger()
      const { app } = buildApp({ dispatcher, logger: captured })
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'daily_dispatch_cap')
      assert.ok(captured.calls.some((c) => c.level === 'warn'), 'daily_dispatch_cap should log at warn')
    },

    'TRIAGE_ENABLED=false → 200 skip triage_disabled, no dispatch': async () => {
      const { app, dispatcher } = buildApp({ triageEnabled: false })
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'triage_disabled')
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'unsupported action → 200 skip unsupported_action': async () => {
      const { app, dispatcher } = buildApp()
      const body = JSON.stringify({ action: 'resolved', data: { issue: { id: 'ABC' } } })
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'unsupported_action:resolved')
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'invalid JSON body (after valid signature) → 200 skip invalid_payload, no Sentry retry': async () => {
      const { app, dispatcher } = buildApp()
      const body = '{ not json'
      const res = await post(app, body)
      assert.equal(res.status, 200)
      assert.equal(res.body.skip, 'invalid_payload')
      assert.equal(dispatcher._calls.create.length, 0)
    },

    'GitHub 5xx during create → 500 so Sentry retries': async () => {
      const dispatcher = stubDispatcher({
        createTriageIssue: async () => {
          const err = new Error('boom')
          err.status = 503
          throw err
        },
      })
      const { app } = buildApp({ dispatcher })
      const body = JSON.stringify(baseEvent())
      const res = await post(app, body)
      assert.equal(res.status, 500)
      assert.equal(res.body.message, 'github_5xx')
    },
  },
})
