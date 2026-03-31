const assert = require('assert')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const createApp = ({ tokenServer, account, config }) => {
  const app = express()
  app.use(express.json())
  app.use('/api/auth', createAuthRouter({ tokenServer, account, config }))
  return app
}

test({
  'token exchange returns internal access token for valid Google token': async () => {
    let issuedAudience
    const app = createApp({
      tokenServer: {
        verifyGoogleIdToken: async () => ({
          iss: 'https://accounts.google.com',
          sub: 'google-sub-123',
        }),
        issueInternalToken: async (params) => {
          issuedAudience = params.audience
          return 'issued-internal-access-token'
        },
      },
      account: {
        findOrCreateByIdentifier: async () => ({ id: 42 }),
      },
      config: {
        frontendURL: 'https://fomoplayer.com',
        allowedOrigins: [],
        allowedOriginRegexes: [],
        isPreviewEnv: false,
        previewAllowedGoogleSubs: [],
        internalAuthHandoffPrivateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        internalAuthHandoffIssuer: 'https://fomoplayer.com',
        internalAuthApiAudience: 'https://api.preview.fomoplayer.com',
        googleClientId: 'test-google-client-id',
      },
    })

    const response = await request(app).post('/api/auth/token/exchange-google').send({ id_token: 'google-id-token' })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.body.access_token, 'issued-internal-access-token')
    assert.strictEqual(response.body.token_type, 'Bearer')
    assert.strictEqual(response.body.expires_in, 900)
    assert.strictEqual(issuedAudience, 'https://api.preview.fomoplayer.com')
  },

  'token exchange rejects missing Google token': async () => {
    const app = createApp({
      tokenServer: {
        verifyGoogleIdToken: async () => ({}),
        issueInternalToken: async () => 'ignored',
      },
      account: {
        findOrCreateByIdentifier: async () => ({ id: 1 }),
      },
      config: {
        frontendURL: 'https://fomoplayer.com',
        allowedOrigins: [],
        allowedOriginRegexes: [],
        isPreviewEnv: false,
        previewAllowedGoogleSubs: [],
        internalAuthHandoffPrivateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        internalAuthHandoffIssuer: 'https://fomoplayer.com',
        internalAuthApiAudience: 'https://api.preview.fomoplayer.com',
        googleClientId: 'test-google-client-id',
      },
    })

    const response = await request(app).post('/api/auth/token/exchange-google').send({})
    assert.strictEqual(response.status, 400)
    assert.strictEqual(response.body.error, 'Missing Google id_token')
  },

  'token exchange rejects invalid Google token': async () => {
    const app = createApp({
      tokenServer: {
        verifyGoogleIdToken: async () => {
          throw new Error('invalid token')
        },
        issueInternalToken: async () => 'ignored',
      },
      account: {
        findOrCreateByIdentifier: async () => ({ id: 1 }),
      },
      config: {
        frontendURL: 'https://fomoplayer.com',
        allowedOrigins: [],
        allowedOriginRegexes: [],
        isPreviewEnv: false,
        previewAllowedGoogleSubs: [],
        internalAuthHandoffPrivateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        internalAuthHandoffIssuer: 'https://fomoplayer.com',
        internalAuthApiAudience: 'https://api.preview.fomoplayer.com',
        googleClientId: 'test-google-client-id',
      },
    })

    const response = await request(app).post('/api/auth/token/exchange-google').send({ id_token: 'invalid' })
    assert.strictEqual(response.status, 401)
    assert.strictEqual(response.body.error, 'Invalid Google id_token')
  },

  'token exchange rejects unauthorized preview user before account creation': async () => {
    let findOrCreateCalled = false
    const app = createApp({
      tokenServer: {
        verifyGoogleIdToken: async () => ({
          iss: 'https://accounts.google.com',
          sub: 'blocked-google-sub',
        }),
        issueInternalToken: async () => 'ignored',
      },
      account: {
        findOrCreateByIdentifier: async () => {
          findOrCreateCalled = true
          return { id: 1 }
        },
      },
      config: {
        frontendURL: 'https://fomoplayer.com',
        allowedOrigins: [],
        allowedOriginRegexes: [],
        isPreviewEnv: true,
        previewAllowedGoogleSubs: ['allowed-google-sub'],
        internalAuthHandoffPrivateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
        internalAuthHandoffIssuer: 'https://fomoplayer.com',
        internalAuthApiAudience: 'https://api.preview.fomoplayer.com',
        googleClientId: 'test-google-client-id',
      },
    })

    const response = await request(app).post('/api/auth/token/exchange-google').send({ id_token: 'blocked-token' })
    assert.strictEqual(response.status, 403)
    assert.strictEqual(response.body.error, 'preview_access_denied')
    assert.strictEqual(findOrCreateCalled, false)
  },
})

