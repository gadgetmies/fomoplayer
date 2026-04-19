const nodeEnv = process.env.NODE_ENV || 'development'
require('dotenv').config({ path: `.env.${nodeEnv}` })

const resolveServiceURL = require('fomoplayer_shared').resolveServiceURL
const sharedConfig = require('fomoplayer_shared/config')(nodeEnv).config
const { parseOriginRegexes } = require('./cors-origin')
const defaultInternalAuthHandoffIssuer = 'https://fomoplayer.com'
const defaultInternalAuthHandoffKid = 'internal-auth-1'
const isPreviewEnv = String(process.env.PREVIEW_ENV || '').toLowerCase() === 'true'
const previewAllowedGoogleSubs =
  process.env.PREVIEW_ALLOWED_GOOGLE_SUBS?.split(',')
    .map((sub) => sub.trim())
    .filter(Boolean) || []

if (isPreviewEnv && previewAllowedGoogleSubs.length === 0) {
  throw new Error('PREVIEW_ALLOWED_GOOGLE_SUBS must be set when PREVIEW_ENV=true')
}

const port = sharedConfig.API_PORT
const frontendURL = resolveServiceURL(sharedConfig.FRONTEND_URL, sharedConfig.IP, sharedConfig.FRONTEND_PORT)
const apiURL = resolveServiceURL(sharedConfig.API_URL, sharedConfig.IP, port, '/api')
const additionalOrigins = process.env.ADDITIONAL_ORIGINS?.split(',').map((origin) => origin.trim()) || []
const allowedOriginRegexes = parseOriginRegexes(process.env.ALLOWED_ORIGIN_REGEX)
const allowedPreviewOriginRegexes = parseOriginRegexes(process.env.ALLOWED_PREVIEW_ORIGIN_REGEX)
const internalAuthHandoffIssuer = process.env.INTERNAL_AUTH_HANDOFF_ISSUER || defaultInternalAuthHandoffIssuer
const internalAuthHandoffPrivateKey = process.env.INTERNAL_AUTH_HANDOFF_PRIVATE_KEY
const internalAuthHandoffPublicKey = process.env.INTERNAL_AUTH_HANDOFF_PUBLIC_KEY
const defaultHandoffRole = isPreviewEnv ? 'verifier' : 'both'
const internalAuthHandoffRole = (process.env.INTERNAL_AUTH_HANDOFF_ROLE || defaultHandoffRole).toLowerCase()
const isHandoffIssuerRole = internalAuthHandoffRole === 'issuer' || internalAuthHandoffRole === 'both'
const isHandoffVerifierRole = internalAuthHandoffRole === 'verifier' || internalAuthHandoffRole === 'both'
if (!['issuer', 'verifier', 'both'].includes(internalAuthHandoffRole)) {
  throw new Error('INTERNAL_AUTH_HANDOFF_ROLE must be one of: issuer, verifier, both')
}
const internalAuthHandoffJwksUrl =
  process.env.INTERNAL_AUTH_HANDOFF_JWKS_URL ||
  (isHandoffVerifierRole && internalAuthHandoffPublicKey ? `${apiURL}/auth/.well-known/jwks.json` : undefined)
const internalAuthApiAudience = process.env.INTERNAL_AUTH_API_AUDIENCE || apiURL
const handoffEnabled =
  String(process.env.INTERNAL_AUTH_HANDOFF_ENABLED || '').toLowerCase() === 'true' ||
  Boolean(
    process.env.INTERNAL_AUTH_HANDOFF_PRIVATE_KEY ||
      process.env.INTERNAL_AUTH_HANDOFF_JWKS_URL ||
      process.env.INTERNAL_AUTH_HANDOFF_PUBLIC_KEY,
  )

if (!internalAuthApiAudience) {
  throw new Error('INTERNAL_AUTH_API_AUDIENCE must be set')
}

if (handoffEnabled && isHandoffVerifierRole && !internalAuthHandoffJwksUrl) {
  throw new Error('INTERNAL_AUTH_HANDOFF_JWKS_URL must be set when verifier role is enabled')
}

if (handoffEnabled && isHandoffIssuerRole && !internalAuthHandoffPrivateKey) {
  throw new Error('INTERNAL_AUTH_HANDOFF_PRIVATE_KEY must be set when issuer role is enabled')
}

if (handoffEnabled && isHandoffIssuerRole && !internalAuthHandoffPublicKey) {
  throw new Error('INTERNAL_AUTH_HANDOFF_PUBLIC_KEY must be set when issuer role is enabled')
}

module.exports = {
  allowedOrigins: [frontendURL, 'chrome-extension://biafmljflmgpbaghhebhmapgajdkdahn', ...additionalOrigins],
  allowedOriginRegexes: [...allowedOriginRegexes, ...allowedPreviewOriginRegexes],
  port,
  apiURL,
  frontendURL,
  googleClientId: process.env.GOOGLE_OIDC_CLIENT_ID,
  googleClientSecret: process.env.GOOGLE_OIDC_CLIENT_SECRET,
  googleOidcApiRedirect: process.env.GOOGLE_OIDC_API_REDIRECT,
  sessionSecret: process.env.SESSION_SECRET,
  cryptoKey: process.env.CRYPTO_KEY,
  maxAccountCount: Number(process.env.MAX_ACCOUNT_COUNT),
  internalAuthHandoffPrivateKey,
  internalAuthHandoffPublicKey,
  internalAuthHandoffKid: process.env.INTERNAL_AUTH_HANDOFF_KID || defaultInternalAuthHandoffKid,
  internalAuthHandoffJwksUrl,
  internalAuthHandoffIssuer,
  internalAuthHandoffRole,
  internalAuthApiAudience,
  isPreviewEnv,
  previewAllowedGoogleSubs,
}
