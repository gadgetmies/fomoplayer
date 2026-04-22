const nodeEnv = process.env.NODE_ENV || 'development'
process.env.NODE_ENV = nodeEnv
require('dotenv').config({ path: `.env.${nodeEnv}` })

const resolveServiceURL = require('fomoplayer_shared').resolveServiceURL
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config
const port = sharedConfig.API_PORT
const frontendURL = resolveServiceURL(sharedConfig.FRONTEND_URL, sharedConfig.IP, sharedConfig.FRONTEND_PORT)
const apiURL = resolveServiceURL(sharedConfig.API_URL, sharedConfig.IP, port, '/api')
const additionalOrigins = process.env.ADDITIONAL_ORIGINS?.split(',').map((origin) => origin.trim()) || []

const safeOrigin = (url) => {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}

const apiOrigin = safeOrigin(apiURL)
const oidcHandoffUrl = process.env.OIDC_HANDOFF_URL || undefined
const oidcHandoffAuthorityOrigin = oidcHandoffUrl ? safeOrigin(oidcHandoffUrl) : null
const isPreviewEnv = process.env.IS_PREVIEW_ENV === 'true'
const isDevelopment = nodeEnv === 'development'
const isTest = nodeEnv === 'test'

module.exports = {
  allowedOrigins: [frontendURL, 'chrome-extension://biafmljflmgpbaghhebhmapgajdkdahn', ...additionalOrigins],
  port,
  apiURL,
  apiOrigin,
  frontendURL,
  googleClientId: process.env.GOOGLE_OIDC_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
  sessionSecret: process.env.SESSION_SECRET,
  cryptoKey: process.env.CRYPTO_KEY,
  maxAccountCount: Number(process.env.MAX_ACCOUNT_COUNT),
  nodeEnv,
  isDevelopment,
  isTest,
  isPreviewEnv,
  oidcHandoffUrl,
  oidcHandoffAuthorityOrigin,
  oidcHandoffSecret: process.env.OIDC_HANDOFF_SECRET || undefined,
}
