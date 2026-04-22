const assert = require('assert')
const { test } = require('cascade-test')

const {
  mintHandoffToken,
  verifyHandoffToken,
  HANDOFF_TOKEN_TTL_SECONDS,
} = require('../../../../routes/shared/auth-handoff-token')

const AUTHORITY = 'https://authority.example.com'
const CONSUMER = 'https://consumer-pr-1.up.railway.app'
const SECRET = 'test-handoff-secret'

const mint = (overrides = {}) =>
  mintHandoffToken({
    secret: SECRET,
    issuer: AUTHORITY,
    audience: CONSUMER,
    oidcIssuer: 'accounts.google.com',
    oidcSubject: '1234567890',
    ...overrides,
  })

const verify = (token, overrides = {}) =>
  verifyHandoffToken({
    token,
    secret: SECRET,
    issuer: AUTHORITY,
    audience: CONSUMER,
    ...overrides,
  })

test({
  'mint returns token and jti': () => {
    const { token, jti } = mint()
    assert.ok(token && typeof token === 'string')
    assert.ok(jti && typeof jti === 'string')
  },

  'freshly minted token is accepted with matching issuer/audience': () => {
    const { token, jti } = mint()
    const payload = verify(token)
    assert.ok(payload)
    assert.strictEqual(payload.jti, jti)
    assert.strictEqual(payload.sub, '1234567890')
    assert.strictEqual(payload.oidcIssuer, 'accounts.google.com')
    assert.strictEqual(payload.iss, AUTHORITY)
    assert.strictEqual(payload.aud, CONSUMER)
  },

  'minted token has expected TTL (~60s)': () => {
    const { token } = mint()
    const payload = verify(token)
    const ttl = payload.exp - payload.iat
    assert.strictEqual(ttl, HANDOFF_TOKEN_TTL_SECONDS)
  },

  'token signed with different secret is rejected': () => {
    const { token } = mint()
    assert.strictEqual(verify(token, { secret: 'other-secret' }), null)
  },

  'token with mismatched issuer is rejected': () => {
    const { token } = mint()
    assert.strictEqual(verify(token, { issuer: 'https://other.example.com' }), null)
  },

  'token with mismatched audience is rejected': () => {
    const { token } = mint()
    assert.strictEqual(verify(token, { audience: 'https://other-pr-2.up.railway.app' }), null)
  },

  'mint without secret throws': () => {
    assert.throws(() => mint({ secret: undefined }))
  },

  'mint without oidc identity throws': () => {
    assert.throws(() => mint({ oidcIssuer: undefined }))
    assert.throws(() => mint({ oidcSubject: undefined }))
  },

  'verify with missing arguments returns null': () => {
    assert.strictEqual(verifyHandoffToken({ token: null, secret: SECRET, issuer: AUTHORITY, audience: CONSUMER }), null)
    assert.strictEqual(verifyHandoffToken({ token: 'x', secret: null, issuer: AUTHORITY, audience: CONSUMER }), null)
  },
})
