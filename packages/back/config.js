const nodeEnv = process.env.NODE_ENV || 'development'
process.env.NODE_ENV = nodeEnv
require('dotenv').config({ path: `.env.${nodeEnv}` })

const resolveServiceURL = require('fomoplayer_shared').resolveServiceURL
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config
const { parseOriginRegexes } = require('./cors-origin')

const port = sharedConfig.API_PORT
const frontendURL = resolveServiceURL(sharedConfig.FRONTEND_URL, sharedConfig.IP, sharedConfig.FRONTEND_PORT)
const apiURL = resolveServiceURL(sharedConfig.API_URL, sharedConfig.IP, port, '/api')
const additionalOrigins = process.env.ADDITIONAL_ORIGINS?.split(',').map((origin) => origin.trim()) || []
const allowedOriginRegexes = parseOriginRegexes(process.env.ALLOWED_ORIGIN_REGEX)
const allowedPreviewOriginRegexes = parseOriginRegexes(process.env.ALLOWED_PREVIEW_ORIGIN_REGEX)

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
const isPreviewEnv = process.env.PREVIEW_ENV === 'true'
const previewAllowedGoogleSubs = (process.env.PREVIEW_ALLOWED_GOOGLE_SUBS || '')
  .split(',')
  .map((sub) => sub.trim())
  .filter((sub) => sub.length > 0)
if (isPreviewEnv && previewAllowedGoogleSubs.length === 0) {
  throw new Error('PREVIEW_ALLOWED_GOOGLE_SUBS must be set when PREVIEW_ENV=true')
}
const isDevelopment = nodeEnv === 'development'
const isTest = nodeEnv === 'test'

module.exports = {
  allowedOrigins: [frontendURL, 'chrome-extension://biafmljflmgpbaghhebhmapgajdkdahn', ...additionalOrigins],
  allowedOriginRegexes: [...allowedOriginRegexes, ...allowedPreviewOriginRegexes],
  port,
  apiURL,
  apiOrigin,
  frontendURL,
  googleClientId: process.env.GOOGLE_OIDC_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
  googleOidcApiRedirect: process.env.GOOGLE_OIDC_API_REDIRECT,
  sessionSecret: process.env.SESSION_SECRET,
  cryptoKey: process.env.CRYPTO_KEY,
  maxAccountCount: Number(process.env.MAX_ACCOUNT_COUNT),
  nodeEnv,
  isDevelopment,
  isTest,
  isPreviewEnv,
  previewAllowedGoogleSubs,
  oidcHandoffUrl,
  oidcHandoffAuthorityOrigin,
  oidcHandoffSecret: process.env.OIDC_HANDOFF_SECRET || undefined,
  githubActionsOidcRepo: process.env.GITHUB_ACTIONS_OIDC_REPO || undefined,
}
