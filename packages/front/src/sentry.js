// Front-end Sentry initialisation. Loaded as the FIRST import of src/index.js
// so any errors during React bootstrap are captured. ES imports are hoisted,
// so init must happen at module-evaluation time (here), not when a caller
// invokes a function.

import * as Sentry from '@sentry/browser'

const RUNTIME_TAG = 'front'

const resolveRelease = () => {
  if (process.env.REACT_APP_SENTRY_RELEASE) return process.env.REACT_APP_SENTRY_RELEASE
  if (process.env.REACT_APP_GIT_SHA) return `front@${process.env.REACT_APP_GIT_SHA.slice(0, 7)}`
  return undefined
}

const dsn = process.env.REACT_APP_SENTRY_DSN
let initState

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.REACT_APP_SENTRY_ENVIRONMENT || process.env.REACT_APP_ENV || 'development',
    release: resolveRelease(),
    tracesSampleRate: 0,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    integrations: [],
  })
  Sentry.setTag('runtime', RUNTIME_TAG)
  initState = { enabled: true }
} else {
  initState = { enabled: false, reason: 'no_dsn' }
}

export const sentryInitState = initState
export { Sentry, RUNTIME_TAG }
