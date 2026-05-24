// Side-effecting import: Sentry SDK initialises at module-evaluation time.
// Keep this FIRST so errors in subsequent imports are reported.
import './sentry'

// Sentry smoke test: visit `/?sentryTest=1` to throw a synthetic error during
// bootstrap. The thrown error propagates to Sentry tagged `runtime: front`.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sentryTest') === '1') {
  throw new Error('sentry-test (front): synthetic error for instrumentation verification')
}

import React from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { unregister } from './registerServiceWorker'

const domNode = document.getElementById('root')
const root = createRoot(domNode)
root.render(<App />)

unregister()
