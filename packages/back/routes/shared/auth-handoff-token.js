const jwt = require('jsonwebtoken')
const { randomUUID } = require('crypto')

const HANDOFF_TOKEN_TTL_SECONDS = 60
const HANDOFF_CLOCK_TOLERANCE_SECONDS = 5

const mintHandoffToken = ({ secret, issuer, audience, oidcIssuer, oidcSubject }) => {
  if (!secret) throw new Error('Handoff secret is not configured')
  if (!oidcIssuer || !oidcSubject) throw new Error('OIDC identity is required to mint a handoff token')

  const jti = randomUUID()
  const token = jwt.sign(
    { sub: String(oidcSubject), oidcIssuer },
    secret,
    {
      jwtid: jti,
      issuer,
      audience,
      expiresIn: HANDOFF_TOKEN_TTL_SECONDS,
      algorithm: 'HS256',
    },
  )
  return { token, jti }
}

const verifyHandoffToken = ({ token, secret, issuer, audience }) => {
  if (!token || !secret || !issuer || !audience) return null
  try {
    const payload = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer,
      audience,
      clockTolerance: HANDOFF_CLOCK_TOLERANCE_SECONDS,
    })
    if (!payload || !payload.jti || !payload.sub || !payload.oidcIssuer || !payload.exp) {
      return null
    }
    return payload
  } catch {
    return null
  }
}

module.exports = { mintHandoffToken, verifyHandoffToken, HANDOFF_TOKEN_TTL_SECONDS }
