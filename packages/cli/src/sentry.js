'use strict'

// Sentry initialisation for the CLI. Loaded at the very top of src/index.js
// so unhandled errors during CLI bootstrap are captured. No-op when
// SENTRY_DSN is unset (the common case for local users).

let Sentry
try {
  Sentry = require('@sentry/node')
} catch (e) {
  Sentry = null
}

const RUNTIME_TAG = 'cli'

const resolveRelease = () => {
  if (process.env.SENTRY_RELEASE) return process.env.SENTRY_RELEASE
  if (process.env.RELEASE_VERSION) return process.env.RELEASE_VERSION
  if (process.env.GIT_SHA) return `cli@${process.env.GIT_SHA.slice(0, 7)}`
  try {
    return `cli@${require('../package.json').version}`
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
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production',
    release: resolveRelease(),
    tracesSampleRate: 0,
    profilesSampleRate: 0,
    sendDefaultPii: false,
    integrations: (defaults) => defaults.filter((i) => i.name !== 'Http' && i.name !== 'NodeFetch'),
  })

  Sentry.setTag('runtime', RUNTIME_TAG)
  return { enabled: true }
}

const flush = (timeoutMs = 2000) => {
  if (!Sentry || typeof Sentry.flush !== 'function') return Promise.resolve()
  return Sentry.flush(timeoutMs)
}

module.exports = { init, flush, RUNTIME_TAG }
