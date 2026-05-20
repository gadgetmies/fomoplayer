// Sentry initialisation for the browser extension. Imported for side effects
// as the FIRST statement of every extension entry point that can throw
// (service worker, content scripts, popup, options, audio host) so unhandled
// errors during each context's bootstrap are captured.
//
// DSN and release come from build-time env vars (webpack EnvironmentPlugin
// in webpack.config.js), per the no-hardcoded-URLs policy. EnvironmentPlugin
// substitutes process.env.X with the build-time string, defaulting to '' when
// unset, so the bundle ships with the SDK disabled if no DSN is provided.

import * as Sentry from '@sentry/browser'

const RUNTIME_TAG = 'extension'

const dsn = process.env.SENTRY_DSN
const release = process.env.SENTRY_RELEASE
const environment = process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'production'

let initState

if (dsn) {
  try {
    Sentry.init({
      dsn,
      environment,
      release: release || undefined,
      tracesSampleRate: 0,
      replaysSessionSampleRate: 0,
      replaysOnErrorSampleRate: 0,
      integrations: [],
    })
    Sentry.setTag('runtime', RUNTIME_TAG)
    initState = { enabled: true }
  } catch (e) {
    initState = { enabled: false, reason: 'init_error', error: e }
  }
} else {
  initState = { enabled: false, reason: 'no_dsn' }
}

export const sentryInitState = initState
export { Sentry, RUNTIME_TAG }
