const nodeEnv = process.env.NODE_ENV || 'development'
process.env.NODE_ENV = nodeEnv
require('dotenv').config({ path: `.env.${nodeEnv}` })

const resolveServiceURL = require('fomoplayer_shared').resolveServiceURL
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config
const { parseOriginRegexes } = require('./cors-origin')

const port = sharedConfig.API_PORT
const frontendURL = resolveServiceURL(sharedConfig.FRONTEND_URL, sharedConfig.IP, sharedConfig.FRONTEND_PORT)
const apiURL = resolveServiceURL(sharedConfig.API_URL, sharedConfig.IP, port, '/api')
const authApiURL = process.env.AUTH_API_URL || `${frontendURL}/api`
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
const sessionCookieDomain = process.env.SESSION_COOKIE_DOMAIN
const previewAllowedGoogleSubs = (process.env.PREVIEW_ALLOWED_GOOGLE_SUBS || '')
  .split(',')
  .map((sub) => sub.trim())
  .filter((sub) => sub.length > 0)
if (isPreviewEnv && previewAllowedGoogleSubs.length === 0) {
  throw new Error('PREVIEW_ALLOWED_GOOGLE_SUBS must be set when PREVIEW_ENV=true')
}
const isProduction = nodeEnv === 'production'

const extensionOauthAllowedIds = (process.env.EXTENSION_OAUTH_ALLOWED_IDS || '')
  .split(',')
  .map((id) => id.trim())
  .filter((id) => id.length > 0)

const DEFAULT_EXTENSION_REDIRECT_PATTERNS = [
  '^chrome-extension://[a-p]{32}/auth-callback\\.html(\\?.*)?$',
  '^moz-extension://[0-9a-fA-F-]{36}/auth-callback\\.html(\\?.*)?$',
  '^safari-web-extension://[0-9A-Fa-f-]{36}/auth-callback\\.html(\\?.*)?$',
]

const extensionOauthAllowedRedirectPatterns = (
  process.env.EXTENSION_OAUTH_ALLOWED_REDIRECT_PATTERNS || DEFAULT_EXTENSION_REDIRECT_PATTERNS.join(',')
)
  .split(',')
  .map((pattern) => pattern.trim())
  .filter((pattern) => pattern.length > 0)
  .map((pattern) => new RegExp(pattern))

const decodePem = (value) => (typeof value === 'string' ? value.replace(/\\n/g, '\n') : undefined)
const internalAuthHandoffPrivateKey = decodePem(process.env.INTERNAL_AUTH_HANDOFF_PRIVATE_KEY) || undefined
const internalAuthHandoffPublicKey = decodePem(process.env.INTERNAL_AUTH_HANDOFF_PUBLIC_KEY) || undefined
const internalAuthHandoffKeyId = process.env.INTERNAL_AUTH_HANDOFF_KEY_ID || undefined
const internalAuthHandoffIssuer = process.env.INTERNAL_AUTH_HANDOFF_ISSUER || undefined
const internalAuthHandoffJwksUrl = process.env.INTERNAL_AUTH_HANDOFF_JWKS_URL || undefined
const internalAuthApiAudience = process.env.INTERNAL_AUTH_API_AUDIENCE || undefined

module.exports = {
  // Extension and per-deployment origins (chrome-extension://, moz-extension://,
  // safari-web-extension://, preview-env hosts, etc.) come from the
  // ADDITIONAL_ORIGINS or ALLOWED_ORIGIN_REGEX env vars — see
  // packages/browser-extension/README.md for the recommended regex shape.
  allowedOrigins: [frontendURL, ...additionalOrigins],
  allowedOriginRegexes: [...allowedOriginRegexes, ...allowedPreviewOriginRegexes],
  port,
  apiURL,
  authApiURL,
  apiOrigin,
  frontendURL,
  googleClientId: process.env.GOOGLE_OIDC_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
  googleOidcApiRedirect: process.env.GOOGLE_OIDC_API_REDIRECT,
  sessionSecret: process.env.SESSION_SECRET,
  sessionCookieDomain,
  cryptoKey: process.env.CRYPTO_KEY,
  maxAccountCount: Number(process.env.MAX_ACCOUNT_COUNT),
  nodeEnv,
  isProduction,
  isPreviewEnv,
  previewAllowedGoogleSubs,
  oidcHandoffUrl,
  oidcHandoffAuthorityOrigin,
  oidcHandoffSecret: process.env.OIDC_HANDOFF_SECRET || undefined,
  githubActionsOidcRepo: process.env.GITHUB_ACTIONS_OIDC_REPO || undefined,
  extensionOauthAllowedIds,
  extensionOauthAllowedRedirectPatterns,
  internalAuthHandoffPrivateKey,
  internalAuthHandoffPublicKey,
  internalAuthHandoffKeyId,
  internalAuthHandoffIssuer,
  internalAuthHandoffJwksUrl,
  internalAuthApiAudience,
  extensionAccessTokenTtlSeconds: 15 * 60,
  extensionRefreshTokenTtlSeconds: 90 * 24 * 60 * 60,
}
