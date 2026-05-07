const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')

const OIDC_STATE_AUDIENCE = 'oidc-state'
const OIDC_STATE_TTL_SECONDS = 5 * 60
const OIDC_STATE_CLOCK_TOLERANCE_SECONDS = 5

const signOidcState = ({ secret, issuer, returnPath, handoffTarget }) => {
  if (!secret) throw new Error('OIDC state secret is not configured')
  if (!issuer) throw new Error('OIDC state issuer is required')
  const jti = randomUUID()
  const token = jwt.sign(
    { returnPath: returnPath ?? null, handoffTarget: handoffTarget ?? null },
    secret,
    {
      jwtid: jti,
      issuer,
      audience: OIDC_STATE_AUDIENCE,
      expiresIn: OIDC_STATE_TTL_SECONDS,
      algorithm: 'HS256',
    },
  )
  return { token, jti }
}

const verifyOidcState = ({ token, secret, issuer }) => {
  if (!token || !secret || !issuer) return null
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer,
      audience: OIDC_STATE_AUDIENCE,
      clockTolerance: OIDC_STATE_CLOCK_TOLERANCE_SECONDS,
    })
    if (!payload || !payload.jti || !payload.exp) return null
    return {
      jti: payload.jti,
      exp: payload.exp,
      returnPath: payload.returnPath ?? null,
      handoffTarget: payload.handoffTarget ?? null,
    }
  } catch {
    return null
  }
}

module.exports = {
  signOidcState,
  verifyOidcState,
  OIDC_STATE_AUDIENCE,
  OIDC_STATE_TTL_SECONDS,
}
