import './sentry'

// Sentry smoke test: open options.html?sentryTest=1 to throw a synthetic
// error tagged `runtime: extension`.
if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('sentryTest') === '1') {
  throw new Error('sentry-test (extension): synthetic error for instrumentation verification')
}

import '../css/options.css'
import '../css/shared.css'
import React from 'react'
import { render } from 'react-dom'
import Root from './options/Root.jsx'
import 'typeface-lato'

render(React.createElement(Root, {}), window.document.getElementById('options-container'))
