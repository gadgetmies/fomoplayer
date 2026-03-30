const shared = require('fomoplayer_shared/config')(process.env.REACT_APP_ENV)
const resolveApiURL = require('./resolveApiURL')
const {
  config: { API_URL, RAW_API_URL, FRONTEND_URL, FRONTEND_PORT },
} = shared

const isBrowserRuntime = typeof window !== 'undefined'

module.exports = {
  serviceURL: FRONTEND_URL,
  servicePort: FRONTEND_PORT,
  apiURL: resolveApiURL({
    apiURL: API_URL,
    rawApiURL: RAW_API_URL,
    hostname: isBrowserRuntime ? window.location.hostname : undefined,
    isBrowserRuntime,
  }),
}
