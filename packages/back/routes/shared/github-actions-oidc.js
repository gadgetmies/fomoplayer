'use strict'

const jwksRsa = require('jwks-rsa')
const jwt = require('jsonwebtoken')

const GITHUB_ACTIONS_ISSUER = 'https://token.actions.githubusercontent.com'

const jwksClient = jwksRsa({
  cache: true,
  rateLimit: true,
  jwksRequestsPerMinute: 5,
  jwksUri: `${GITHUB_ACTIONS_ISSUER}/.well-known/jwks.json`,
})

const getSigningKey = (header, callback) => {
  jwksClient.getSigningKey(header.kid, (err, key) => {
    if (err) return callback(err)
    callback(null, key.getPublicKey())
  })
}

const verifyActionsToken = ({ token, audience, allowedRepo }) =>
  new Promise((resolve) => {
    if (!token || !audience || !allowedRepo) return resolve(null)
    jwt.verify(
      token,
      getSigningKey,
      { issuer: GITHUB_ACTIONS_ISSUER, audience, algorithms: ['RS256'] },
      (err, payload) => {
        if (err || !payload || typeof payload !== 'object') return resolve(null)
        if (payload.repository !== allowedRepo) return resolve(null)
        resolve(payload)
      },
    )
  })

module.exports = { verifyActionsToken, GITHUB_ACTIONS_ISSUER }
