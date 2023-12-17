const shared = require('fomoplayer_shared/config')(process.env.REACT_APP_ENV)
const { config: { API_URL, FRONTEND_URL, FRONTEND_PORT } } = shared

module.exports = {
  serviceURL: FRONTEND_URL,
  servicePort: FRONTEND_PORT,
  apiURL: API_URL
}
