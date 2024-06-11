const nodeEnv = process.env.NODE_ENV || 'development'
require('dotenv').config({ path: `.env.${nodeEnv}` })

const resolveServiceURL = require('fomoplayer_shared').resolveServiceURL
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config
const port = sharedConfig.API_PORT
const frontendURL = resolveServiceURL(sharedConfig.FRONTEND_URL, sharedConfig.IP, sharedConfig.FRONTEND_PORT)
const apiURL = resolveServiceURL(sharedConfig.API_URL, sharedConfig.IP, port, '/api')

module.exports = {
  allowedOrigins: [frontendURL, 'chrome-extension://biafmljflmgpbaghhebhmapgajdkdahn'],
  port,
  apiURL,
  frontendURL,
  googleClientId: process.env.GOOGLE_OIDC_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
  cryptoKey: process.env.CRYPTO_KEY,
}
