'use strict'

// Sentry initialisation for the backend. Loaded at the very top of index.js
// before any code that could throw, so unhandled errors during bootstrap are
// captured.

let Sentry
try {
  Sentry = require('@sentry/node')
} catch (e) {
  Sentry = null
}

const RUNTIME_TAG = 'back'

const resolveRelease = () => {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE
  if (process.env.RELEASE_VERSION) return process.env.RELEASE_VERSION
  if (process.env.GIT_SHA) return `back@${process.env.GIT_SHA.slice(0, 7)}`
  try {
    return `back@${require('./package.json').version}`
  } catch (_) {
    return undefined
  }
}

const init = () => {
  if (!Sentry) return { enabled: false, reason: 'sdk_missing' }
  const dsn = process.env.SENTRY_DSN
  if (!dsn) return { enabled: false, reason: 'no_dsn' }

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    release: resolveRelease(),
    // Errors-only: no tracing, profiling, or replay (see sentry-error-reporting spec).
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    sendDefaultPii: false,
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Http' && i.name !== 'NodeFetch'),
  })

  Sentry.setTag('runtime', RUNTIME_TAG)

  return { enabled: true }
}

const setupExpressErrorHandler = (app) => {
  if (!Sentry || typeof Sentry.setupExpressErrorHandler !== 'function') return
  Sentry.setupExpressErrorHandler(app)
}

const captureException = (error, context) => {
  if (!Sentry) return
  if (context) {
    Sentry.withScope((scope) => {
      Object.entries(context).forEach(([key, value]) => scope.setExtra(key, value))
      Sentry.captureException(error)
    })
  } else {
    Sentry.captureException(error)
  }
}

module.exports = { init, setupExpressErrorHandler, captureException, RUNTIME_TAG }
