const shared = require('fomoplayer_shared/config')(process.env.REACT_APP_ENV)
const resolveApiURL = require('./resolveApiURL')
const {
  config: { API_URL, RAW_API_URL, FRONTEND_URL, FRONTEND_PORT },
} = shared

const isBrowserRuntime = typeof window !== 'undefined'
const isPreviewEnv = String(process.env.REACT_APP_PREVIEW_ENV || process.env.PREVIEW_ENV || '').toLowerCase() === 'true'

module.exports = {
  serviceURL: FRONTEND_URL,
  servicePort: FRONTEND_PORT,
  isPreviewEnv,
  apiURL: resolveApiURL({
    apiURL: API_URL,
    rawApiURL: RAW_API_URL,
    hostname: isBrowserRuntime ? window.location.hostname : undefined,
    isBrowserRuntime,
  }),
}
