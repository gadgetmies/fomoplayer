'use strict'

const jwksRsa = require('jwks-rsa')
const jwt = require('jsonwebtoken')

const GITHUB_ACTIONS_ISSUER = 'https://token.actions.githubusercontent.com'
// GitHub Actions OIDC publishes its JWKS at /.well-known/jwks (no `.json`
// suffix). The discovery doc at
// https://token.actions.githubusercontent.com/.well-known/openid-configuration
// declares this; the .json URL returns 404 and surfaces here as
// `JwksError: Not Found`.
const GITHUB_ACTIONS_JWKS_URI = `${GITHUB_ACTIONS_ISSUER}/.well-known/jwks`

const defaultJwksClient = jwksRsa({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  jwksUri: GITHUB_ACTIONS_JWKS_URI,
})

const extractUnverifiedClaims = (token) => {
  try {
    const decoded = jwt.decode(token, { complete: true })
    if (!decoded || typeof decoded !== 'object') return null
    const payload = decoded.payload && typeof decoded.payload === 'object' ? decoded.payload : {}
    const header = decoded.header && typeof decoded.header === 'object' ? decoded.header : {}
    return {
      iss: payload.iss ?? null,
      aud: payload.aud ?? null,
      sub: payload.sub ?? null,
      repository: payload.repository ?? null,
      exp: payload.exp ?? null,
      alg: header.alg ?? null,
    }
  } catch {
    return null
  }
}

const createVerifyActionsToken = ({ jwksClient = defaultJwksClient } = {}) =>
  ({ token, audience, allowedRepo, logger } = {}) =>
    new Promise((resolve) => {
      const safeWarn = (reason, detail) => {
        const payload = {
          reason,
          expectedAudience: audience ?? null,
          expectedRepo: allowedRepo ?? null,
          issuer: GITHUB_ACTIONS_ISSUER,
          ...detail,
        }
        try {
          console.warn(`[verifyActionsToken] ${JSON.stringify(payload)}`)
        } catch {
          /* never let logging break verification */
        }
        if (typeof logger?.warn === 'function') logger.warn(payload)
      }

      if (!token || !audience || !allowedRepo) {
        const missing = []
        if (!token) missing.push('token')
        if (!audience) missing.push('audience')
        if (!allowedRepo) missing.push('allowedRepo')
        safeWarn('verifier-input-missing', { missing })
        return resolve(null)
      }

      let jwksFetchFailedWarned = false
      const getSigningKey = (header, callback) => {
        jwksClient.getSigningKey(header.kid, (err, key) => {
          if (err) {
            safeWarn('jwks-key-fetch-failed', {
              kid: header?.kid ?? null,
              errorName: err.name ?? null,
              errorMessage: err.message ?? null,
            })
            jwksFetchFailedWarned = true
            return callback(err)
          }
          callback(null, key.getPublicKey())
        })
      }

      jwt.verify(
        token,
        getSigningKey,
        { issuer: GITHUB_ACTIONS_ISSUER, audience, algorithms: ['RS256'] },
        (err, payload) => {
          if (err || !payload || typeof payload !== 'object') {
            if (!jwksFetchFailedWarned) {
              safeWarn('signature-or-claim-verification-failed', {
                jwtErrorName: err?.name ?? null,
                jwtErrorMessage: err?.message ?? null,
                unverifiedClaims: extractUnverifiedClaims(token),
              })
            }
            return resolve(null)
          }
          if (payload.repository !== allowedRepo) {
            safeWarn('repository-claim-mismatch', {
              observedRepo: payload.repository ?? null,
            })
            return resolve(null)
          }
          resolve(payload)
        },
      )
    })

const verifyActionsToken = createVerifyActionsToken()

module.exports = {
  verifyActionsToken,
  createVerifyActionsToken,
  GITHUB_ACTIONS_ISSUER,
  GITHUB_ACTIONS_JWKS_URI,
}
