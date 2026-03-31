const assert = require('assert')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const createSessionMiddleware = (session) => (req, _, next) => {
  req.session = session
  req.sessionID = 'preview-session-id'
  req.session.regenerate = (cb) => {
    req.session = {}
    req.sessionID = 'preview-session-id-regenerated'
    cb()
  }
  req.login = (user, cb) => {
    req.user = user
    cb()
  }
  next()
}

const createApp = ({ session, tokenServer, account, config, queryAccountCount, deleteInviteCode, consumeHandoffJti }) => {
  const app = express()
  app.use(express.json())
  app.use(createSessionMiddleware(session))
  app.use('/api/auth', createAuthRouter({ tokenServer, account, config, queryAccountCount, deleteInviteCode, consumeHandoffJti }))
  return app
}

const config = {
  frontendURL: 'https://fomoplayer.com',
  allowedOrigins: ['https://preview.fomoplayer.com'],
  allowedOriginRegexes: [],
  isPreviewEnv: false,
  previewAllowedGoogleSubs: [],
  internalAuthHandoffJwksUrl: 'https://auth.example.com/api/auth/.well-known/jwks.json',
  internalAuthHandoffIssuer: 'https://fomoplayer.com',
  googleClientId: 'google-client-id',
  maxAccountCount: 10,
}

test({
  'handoff exchange rejects new user when sign up is closed and invite code missing': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-1', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: undefined,
    }
    const app = createApp({
      session,
      tokenServer: {
        verifyInternalToken: async () => ({
          iss: config.internalAuthHandoffIssuer,
          aud: 'https://preview.fomoplayer.com',
          sub: 'google-sub',
          sid: 'preview-session-id',
          nonce: 'nonce-1',
          oidc_iss: 'https://accounts.google.com',
          jti: 'jti-1',
          token_type: 'preview_handoff',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      },
      account: {
        findByIdentifier: async () => null,
        findOrCreateByIdentifier: async () => {
          throw new Error('should not create user without invite when sign up closed')
        },
      },
      queryAccountCount: async () => 999,
      deleteInviteCode: async () => 0,
      consumeHandoffJti: async () => true,
      config,
    })

    const response = await request(app)
      .post('/api/auth/handoff/exchange')
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'preview.fomoplayer.com')
      .send({ code: 'handoff-token' })

    assert.strictEqual(response.status, 403)
    assert.strictEqual(response.body.error, 'Sign up is not available')
  },

  'handoff exchange creates user when sign up is closed and invite code is valid': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-2', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: 'invite-123',
    }
    let created = false
    let createIssuer
    let createSubject
    const app = createApp({
      session,
      tokenServer: {
        verifyInternalToken: async () => ({
          iss: config.internalAuthHandoffIssuer,
          aud: 'https://preview.fomoplayer.com',
          sub: 'google-sub-2',
          sid: 'preview-session-id',
          nonce: 'nonce-2',
          oidc_iss: 'https://accounts.google.com',
          jti: 'jti-2',
          token_type: 'preview_handoff',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      },
      account: {
        findByIdentifier: async () => null,
        findOrCreateByIdentifier: async (issuer, subject) => {
          created = true
          createIssuer = issuer
          createSubject = subject
          return { id: 7 }
        },
      },
      queryAccountCount: async () => 999,
      deleteInviteCode: async (inviteCode) => (inviteCode === 'invite-123' ? 1 : 0),
      consumeHandoffJti: async () => true,
      config,
    })

    const response = await request(app)
      .post('/api/auth/handoff/exchange')
      .set('x-forwarded-proto', 'https')
      .set('x-forwarded-host', 'preview.fomoplayer.com')
      .send({ code: 'handoff-token' })

    assert.strictEqual(response.status, 204)
    assert.strictEqual(created, true)
    assert.strictEqual(createIssuer, 'https://accounts.google.com')
    assert.strictEqual(createSubject, 'google-sub-2')
  },

  'handoff exchange rejects token with audience that does not match validated preview origin': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-3', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: undefined,
    }
    const app = createApp({
      session,
      tokenServer: {
        verifyInternalToken: async () => ({
          iss: config.internalAuthHandoffIssuer,
          aud: 'https://different.preview.fomoplayer.com',
          sub: 'google-sub-3',
          sid: 'preview-session-id',
          nonce: 'nonce-3',
          oidc_iss: 'https://accounts.google.com',
          jti: 'jti-3',
          token_type: 'preview_handoff',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      },
      account: {
        findByIdentifier: async () => ({ id: 1 }),
        findOrCreateByIdentifier: async () => ({ id: 1 }),
      },
      queryAccountCount: async () => 0,
      deleteInviteCode: async () => 0,
      consumeHandoffJti: async () => true,
      config,
    })

    const response = await request(app).post('/api/auth/handoff/exchange').send({ code: 'handoff-token' })
    assert.strictEqual(response.status, 401)
    assert.strictEqual(response.body.error, 'Invalid handoff payload')
  },

  'handoff exchange requires jwks configuration and does not fall back to shared secret': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-4', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: undefined,
    }
    const app = createApp({
      session,
      tokenServer: {
        verifyInternalToken: async () => ({
          iss: config.internalAuthHandoffIssuer,
          aud: 'https://preview.fomoplayer.com',
          sub: 'google-sub-4',
          sid: 'preview-session-id',
          nonce: 'nonce-4',
          oidc_iss: 'https://accounts.google.com',
          jti: 'jti-4',
          token_type: 'preview_handoff',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      },
      account: {
        findByIdentifier: async () => ({ id: 1 }),
        findOrCreateByIdentifier: async () => ({ id: 1 }),
      },
      queryAccountCount: async () => 0,
      deleteInviteCode: async () => 0,
      consumeHandoffJti: async () => true,
      config: {
        ...config,
        internalAuthHandoffJwksUrl: undefined,
      },
    })

    const response = await request(app).post('/api/auth/handoff/exchange').send({ code: 'handoff-token' })
    assert.strictEqual(response.status, 500)
    assert.strictEqual(response.body.error, 'OIDC handoff is not configured')
  },

  'handoff exchange rejects non-allowlisted preview user before account lookup': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-5', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: undefined,
    }
    let accountLookupCalled = false
    const app = createApp({
      session,
      tokenServer: {
        verifyInternalToken: async () => ({
          iss: config.internalAuthHandoffIssuer,
          aud: 'https://preview.fomoplayer.com',
          sub: 'blocked-sub',
          sid: 'preview-session-id',
          nonce: 'nonce-5',
          oidc_iss: 'https://accounts.google.com',
          jti: 'jti-5',
          token_type: 'preview_handoff',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      },
      account: {
        findByIdentifier: async () => {
          accountLookupCalled = true
          return null
        },
        findOrCreateByIdentifier: async () => {
          throw new Error('must not create user for denied preview access')
        },
      },
      queryAccountCount: async () => 0,
      deleteInviteCode: async () => 0,
      consumeHandoffJti: async () => true,
      config: {
        ...config,
        isPreviewEnv: true,
        previewAllowedGoogleSubs: ['allowed-sub'],
      },
    })

    const response = await request(app).post('/api/auth/handoff/exchange').send({ code: 'handoff-token' })
    assert.strictEqual(response.status, 403)
    assert.strictEqual(response.body.error, 'preview_access_denied')
    assert.strictEqual(accountLookupCalled, false)
  },

  'handoff exchange rejects replayed jti using durable consume hook': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-6', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: undefined,
    }
    const app = createApp({
      session,
      tokenServer: {
        verifyInternalToken: async () => ({
          iss: config.internalAuthHandoffIssuer,
          aud: 'https://preview.fomoplayer.com',
          sub: 'google-sub-6',
          sid: 'preview-session-id',
          nonce: 'nonce-6',
          oidc_iss: 'https://accounts.google.com',
          jti: 'jti-6',
          token_type: 'preview_handoff',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 60,
        }),
      },
      account: {
        findByIdentifier: async () => ({ id: 1 }),
        findOrCreateByIdentifier: async () => ({ id: 1 }),
      },
      queryAccountCount: async () => 0,
      deleteInviteCode: async () => 0,
      consumeHandoffJti: async () => false,
      config,
    })

    const response = await request(app).post('/api/auth/handoff/exchange').send({ code: 'handoff-token' })
    assert.strictEqual(response.status, 401)
    assert.strictEqual(response.body.error, 'Handoff code has already been used')
  },

  'handoff exchange regenerates session before login': async () => {
    const session = {
      oidcHandoff: { nonce: 'nonce-7', returnOrigin: 'https://preview.fomoplayer.com' },
      inviteCode: undefined,
    }
    let regenerateCalled = false
    const app = express()
    app.use(express.json())
    app.use((req, _, next) => {
      req.session = session
      req.sessionID = 'preview-session-id'
      req.session.regenerate = (cb) => {
        regenerateCalled = true
        req.session = {}
        req.sessionID = 'preview-session-id-regenerated'
        cb()
      }
      req.login = (_, cb) => cb()
      next()
    })
    app.use(
      '/api/auth',
      createAuthRouter({
        tokenServer: {
          verifyInternalToken: async () => ({
            iss: config.internalAuthHandoffIssuer,
            aud: 'https://preview.fomoplayer.com',
            sub: 'google-sub-7',
            sid: 'preview-session-id',
            nonce: 'nonce-7',
            oidc_iss: 'https://accounts.google.com',
            jti: 'jti-7',
            token_type: 'preview_handoff',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 60,
          }),
        },
        account: {
          findByIdentifier: async () => ({ id: 1 }),
          findOrCreateByIdentifier: async () => ({ id: 1 }),
        },
        queryAccountCount: async () => 0,
        deleteInviteCode: async () => 0,
        consumeHandoffJti: async () => true,
        config,
      }),
    )

    const response = await request(app).post('/api/auth/handoff/exchange').send({ code: 'handoff-token' })
    assert.strictEqual(response.status, 204)
    assert.strictEqual(regenerateCalled, true)
  },
})

