'use strict'

const { generateKeyPairSync } = require('crypto')
const { expect } = require('chai')
const jwt = require('jsonwebtoken')
const { test } = require('cascade-test')

const {
  createVerifyActionsToken,
  GITHUB_ACTIONS_ISSUER,
  GITHUB_ACTIONS_JWKS_URI,
} = require('../../../../routes/shared/github-actions-oidc')

const AUDIENCE = 'https://preview-pr-1.up.railway.app'
const ALLOWED_REPO = 'owner/fomoplayer'

const generateKeyPair = () =>
  generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

const mintToken = (privateKey, claims = {}, options = {}) =>
  jwt.sign(
    {
      iss: GITHUB_ACTIONS_ISSUER,
      aud: AUDIENCE,
      sub: `repo:${ALLOWED_REPO}:ref:refs/heads/main`,
      repository: ALLOWED_REPO,
      ...claims,
    },
    privateKey,
    { algorithm: 'RS256', expiresIn: '5m', keyid: 'test-kid', ...options },
  )

const fakeJwksClient = (publicKey) => ({
  getSigningKey: (_kid, cb) => cb(null, { getPublicKey: () => publicKey }),
})

const erroringJwksClient = (error) => ({
  getSigningKey: (_kid, cb) => cb(error),
})

const createRecordingLogger = () => {
  const calls = []
  return {
    warn: (payload) => calls.push(payload),
    calls,
  }
}

test({
  'JWKS URI matches GitHub Actions OIDC discovery (regression: 401 from wrong path)': () => {
    expect(GITHUB_ACTIONS_JWKS_URI).to.equal(
      'https://token.actions.githubusercontent.com/.well-known/jwks',
    )
    expect(GITHUB_ACTIONS_JWKS_URI.endsWith('.json')).to.equal(false)
  },

  'verifier-input-missing — missing token logs reason and resolves null': async () => {
    const logger = createRecordingLogger()
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient('unused') })
    const result = await verify({ token: null, audience: AUDIENCE, allowedRepo: ALLOWED_REPO, logger })
    expect(result).to.equal(null)
    expect(logger.calls).to.have.length(1)
    expect(logger.calls[0].reason).to.equal('verifier-input-missing')
    expect(logger.calls[0].missing).to.deep.equal(['token'])
    expect(logger.calls[0].expectedAudience).to.equal(AUDIENCE)
    expect(logger.calls[0].expectedRepo).to.equal(ALLOWED_REPO)
    expect(logger.calls[0].issuer).to.equal(GITHUB_ACTIONS_ISSUER)
  },

  'verifier-input-missing — multiple missing inputs are all listed': async () => {
    const logger = createRecordingLogger()
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient('unused') })
    const result = await verify({ token: 'x', audience: undefined, allowedRepo: undefined, logger })
    expect(result).to.equal(null)
    expect(logger.calls[0].missing).to.deep.equal(['audience', 'allowedRepo'])
  },

  'jwks-key-fetch-failed — JWKS error is logged with kid and error detail': async () => {
    const logger = createRecordingLogger()
    const { privateKey } = generateKeyPair()
    const token = mintToken(privateKey)
    const fetchError = new Error('boom')
    fetchError.name = 'SigningKeyNotFoundError'
    const verify = createVerifyActionsToken({ jwksClient: erroringJwksClient(fetchError) })

    const result = await verify({ token, audience: AUDIENCE, allowedRepo: ALLOWED_REPO, logger })

    expect(result).to.equal(null)
    const jwksWarns = logger.calls.filter((c) => c.reason === 'jwks-key-fetch-failed')
    expect(jwksWarns).to.have.length(1)
    expect(jwksWarns[0].kid).to.equal('test-kid')
    expect(jwksWarns[0].errorName).to.equal('SigningKeyNotFoundError')
    expect(jwksWarns[0].errorMessage).to.equal('boom')
    const sigWarns = logger.calls.filter((c) => c.reason === 'signature-or-claim-verification-failed')
    expect(sigWarns).to.have.length(0)
  },

  'signature-or-claim-verification-failed — wrong signing key surfaces unverified claims': async () => {
    const logger = createRecordingLogger()
    const minted = generateKeyPair()
    const otherPair = generateKeyPair()
    const token = mintToken(minted.privateKey)
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient(otherPair.publicKey) })

    const result = await verify({ token, audience: AUDIENCE, allowedRepo: ALLOWED_REPO, logger })

    expect(result).to.equal(null)
    expect(logger.calls).to.have.length(1)
    expect(logger.calls[0].reason).to.equal('signature-or-claim-verification-failed')
    expect(logger.calls[0].jwtErrorName).to.be.a('string')
    expect(logger.calls[0].unverifiedClaims.iss).to.equal(GITHUB_ACTIONS_ISSUER)
    expect(logger.calls[0].unverifiedClaims.aud).to.equal(AUDIENCE)
    expect(logger.calls[0].unverifiedClaims.repository).to.equal(ALLOWED_REPO)
    expect(logger.calls[0].unverifiedClaims.alg).to.equal('RS256')
  },

  'signature-or-claim-verification-failed — wrong audience surfaces observed aud': async () => {
    const logger = createRecordingLogger()
    const { privateKey, publicKey } = generateKeyPair()
    const token = mintToken(privateKey, { aud: 'https://wrong.example.com' })
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient(publicKey) })

    const result = await verify({ token, audience: AUDIENCE, allowedRepo: ALLOWED_REPO, logger })

    expect(result).to.equal(null)
    expect(logger.calls[0].reason).to.equal('signature-or-claim-verification-failed')
    expect(logger.calls[0].unverifiedClaims.aud).to.equal('https://wrong.example.com')
  },

  'repository-claim-mismatch — signature verifies but repo is wrong': async () => {
    const logger = createRecordingLogger()
    const { privateKey, publicKey } = generateKeyPair()
    const token = mintToken(privateKey, { repository: 'other/repo' })
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient(publicKey) })

    const result = await verify({ token, audience: AUDIENCE, allowedRepo: ALLOWED_REPO, logger })

    expect(result).to.equal(null)
    expect(logger.calls).to.have.length(1)
    expect(logger.calls[0].reason).to.equal('repository-claim-mismatch')
    expect(logger.calls[0].observedRepo).to.equal('other/repo')
    expect(logger.calls[0].expectedRepo).to.equal(ALLOWED_REPO)
  },

  'happy path — valid token resolves the payload and emits no warn': async () => {
    const logger = createRecordingLogger()
    const { privateKey, publicKey } = generateKeyPair()
    const token = mintToken(privateKey)
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient(publicKey) })

    const result = await verify({ token, audience: AUDIENCE, allowedRepo: ALLOWED_REPO, logger })

    expect(result).to.be.an('object')
    expect(result.repository).to.equal(ALLOWED_REPO)
    expect(logger.calls).to.have.length(0)
  },

  'no-logger silent rejection — verification failure resolves null without throwing': async () => {
    const { privateKey, publicKey } = generateKeyPair()
    const token = mintToken(privateKey, { repository: 'other/repo' })
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient(publicKey) })
    const result = await verify({ token, audience: AUDIENCE, allowedRepo: ALLOWED_REPO })
    expect(result).to.equal(null)
  },

  'no-logger silent rejection — logger without .warn function does not throw': async () => {
    const { privateKey, publicKey } = generateKeyPair()
    const token = mintToken(privateKey, { repository: 'other/repo' })
    const verify = createVerifyActionsToken({ jwksClient: fakeJwksClient(publicKey) })
    const result = await verify({
      token,
      audience: AUDIENCE,
      allowedRepo: ALLOWED_REPO,
      logger: { warn: 'not-a-function' },
    })
    expect(result).to.equal(null)
  },
})
