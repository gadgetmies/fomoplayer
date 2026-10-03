import React from 'react'
import { Sentry } from './sentry'
import { requestWithCredentials } from './request-json-with-credentials.js'
import './buttons.css'
import './ErrorFallback.css'

const serializeError = (error) =>
  error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : { message: String(error) }

// React does not forward errors caught by an error boundary to the global error handlers in
// production builds, so report them explicitly: to Sentry (works without a session) and to the
// backend log (needs a session; failures are ignored so reporting never throws).
export const reportRenderError = (error, { componentStack } = {}) => {
  Sentry.captureException(error, { contexts: { react: { componentStack } } })
  requestWithCredentials({
    path: '/log/error',
    method: 'POST',
    body: { error: serializeError(error), componentStack },
  }).catch(() => {})
}

export const ErrorFallback = () => (
  <div className="error-fallback" role="alert">
    <h2>Something went wrong</h2>
    <p>The error has been reported. Reloading the page usually helps.</p>
    <button
      className="button button-push_button button-push_button-large button-push_button-primary"
      onClick={() => window.location.reload()}
    >
      Reload
    </button>
  </div>
)

// Test hook, like ?sentryTest=1 in index.js: visit any page with ?crashTest=1 to throw during
// render inside the error boundary.
export const CrashTest = () => {
  if (new URLSearchParams(window.location.search).get('crashTest') === '1') {
    throw new Error('crash-test (front): synthetic render error for error boundary verification')
  }
  return null
}
