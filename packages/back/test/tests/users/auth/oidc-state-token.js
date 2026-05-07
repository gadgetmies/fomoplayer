const assert = require('assert')
const { test } = require('cascade-test')
const jwt = require('jsonwebtoken')

const {
  signOidcState,
  verifyOidcState,
  OIDC_STATE_AUDIENCE,
  OIDC_STATE_TTL_SECONDS,
} = require('../../../../routes/shared/oidc-state-token')

const ISSUER = 'https://authority.example.com'
const SECRET = 'test-oidc-state-secret'

const sign = (overrides = {}) =>
  signOidcState({
    secret: SECRET,
    issuer: ISSUER,
    returnPath: '/some/path',
    handoffTarget: 'https://consumer-pr-1.up.railway.app',
    ...overrides,
  })

const verify = (token, overrides = {}) =>
  verifyOidcState({ token, secret: SECRET, issuer: ISSUER, ...overrides })

test({
  'sign returns token and jti': () => {
    const { token, jti } = sign()
    assert.ok(token && typeof token === 'string')
    assert.ok(jti && typeof jti === 'string')
  },

  'roundtrip preserves returnPath and handoffTarget': () => {
    const { token, jti } = sign()
    const payload = verify(token)
    assert.ok(payload)
    assert.strictEqual(payload.jti, jti)
    assert.strictEqual(payload.returnPath, '/some/path')
    assert.strictEqual(payload.handoffTarget, 'https://consumer-pr-1.up.railway.app')
  },

  'roundtrip works with null returnPath': () => {
    const { token } = sign({ returnPath: undefined })
    const payload = verify(token)
    assert.ok(payload)
    assert.strictEqual(payload.returnPath, null)
  },

  'tampered signature is rejected': () => {
    const { token } = sign()
    const parts = token.split('.')
    const tampered = `${parts[0]}.${parts[1]}.${'A'.repeat(parts[2].length)}`
    assert.strictEqual(verify(tampered), null)
  },

  'token signed with different secret is rejected': () => {
    const { token } = sign()
    assert.strictEqual(verify(token, { secret: 'other-secret' }), null)
  },

  'wrong issuer is rejected': () => {
    const { token } = sign()
    assert.strictEqual(verify(token, { issuer: 'https://other.example.com' }), null)
  },

  'wrong audience (signed with another aud) is rejected': () => {
    const wrongAudToken = jwt.sign({}, SECRET, {
      issuer: ISSUER,
      audience: 'something-else',
      jwtid: 'jti-x',
      expiresIn: OIDC_STATE_TTL_SECONDS,
      algorithm: 'HS256',
    })
    assert.strictEqual(verify(wrongAudToken), null)
  },

  'expired token is rejected': () => {
    const expiredToken = jwt.sign({ returnPath: '/x', handoffTarget: 'https://c.example.com' }, SECRET, {
      issuer: ISSUER,
      audience: OIDC_STATE_AUDIENCE,
      jwtid: 'jti-x',
      expiresIn: -10,
      algorithm: 'HS256',
    })
    assert.strictEqual(verify(expiredToken), null)
  },

  'verify with missing arguments returns null': () => {
    assert.strictEqual(verifyOidcState({ token: null, secret: SECRET, issuer: ISSUER }), null)
    assert.strictEqual(verifyOidcState({ token: 'x', secret: null, issuer: ISSUER }), null)
    assert.strictEqual(verifyOidcState({ token: 'x', secret: SECRET, issuer: null }), null)
  },

  'sign without secret throws': () => {
    assert.throws(() => sign({ secret: undefined }))
  },

  'sign without issuer throws': () => {
    assert.throws(() => sign({ issuer: undefined }))
  },
})
