'use strict'

const { expect } = require('chai')
const crypto = require('crypto')
const express = require('express')
const request = require('supertest')
const passport = require('passport')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const ALLOWED_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'
const ALLOWED_REDIRECT_URI = `chrome-extension://${ALLOWED_EXTENSION_ID}/auth-callback.html`

const generatePrivateKey = () => {
  const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 })
  return privateKey.export({ type: 'pkcs8', format: 'pem' })
}

const baseConfig = (privateKeyPem) => ({
  frontendURL: 'https://fomoplayer.com',
  apiOrigin: 'https://fomoplayer.com',
  allowedOrigins: [],
  allowedOriginRegexes: [],
  isPreviewEnv: false,
  previewAllowedGoogleSubs: [],
  extensionOauthAllowedIds: [ALLOWED_EXTENSION_ID],
  extensionOauthAllowedRedirectPatterns: [/^chrome-extension:\/\/[a-p]{32}\/auth-callback\.html$/],
  internalAuthHandoffPrivateKey: privateKeyPem,
  internalAuthHandoffKeyId: 'test-kid',
  internalAuthHandoffIssuer: 'https://fomoplayer.com',
  internalAuthApiAudience: 'https://api.fomoplayer.com',
  extensionAccessTokenTtlSeconds: 900,
  extensionRefreshTokenTtlSeconds: 60,
})

const buildAppWithSession = (session = {}) => {
  const app = express()
  let sessionStore = { ...session }
  app.use((req, _, next) => {
    const proxy = new Proxy(
      {},
      {
        get: (_t, key) => sessionStore[key],
        set: (_t, key, value) => {
          sessionStore[key] = value
          return true
        },
        deleteProperty: (_t, key) => {
          delete sessionStore[key]
          return true
        },
        has: (_t, key) => key in sessionStore,
        ownKeys: () => Reflect.ownKeys(sessionStore),
        getOwnPropertyDescriptor: (_t, key) => Object.getOwnPropertyDescriptor(sessionStore, key),
      },
    )
    req.session = proxy
    const isAuthenticated = Boolean(session.userId)
    req.isAuthenticated = () => isAuthenticated
    if (isAuthenticated) req.user = { id: session.userId }
    // Simulate passport's session.regenerate() inside req.login() — wipes prior data.
    req.login = (_, cb) => {
      sessionStore = {}
      cb()
    }
    next()
  })
  app.use('/api/auth', createAuthRouter({ config: baseConfig(generatePrivateKey()) }))
  return { app, getSession: () => sessionStore }
}

const withPatchedPassportAuthenticate = async (authenticateImpl, run) => {
  const original = passport.authenticate
  passport.authenticate = authenticateImpl
  try {
    return await run()
  } finally {
    passport.authenticate = original
  }
}

test({
  'GET /login/extension/google carries extension PKCE fields via OIDC state': async () => {
    const calls = []
    const { app } = buildAppWithSession({
      extensionId: ALLOWED_EXTENSION_ID,
      extensionCodeChallenge: 'challenge-123',
      extensionCodeChallengeMethod: 'S256',
      extensionState: 'state-123',
      extensionRedirectUri: ALLOWED_REDIRECT_URI,
    })
    const response = await withPatchedPassportAuthenticate((strategy, options) => {
      calls.push({ strategy, options })
      return (_, res) => res.status(204).end()
    }, async () => request(app).get('/api/auth/login/extension/google'))

    expect(response.status).to.equal(204)
    expect(calls).to.have.length(1)
    expect(calls[0].strategy).to.equal('openidconnect')
    expect(calls[0].options).to.deep.equal({
      state: {
        returnToExtension: true,
        extensionId: ALLOWED_EXTENSION_ID,
        extensionCodeChallenge: 'challenge-123',
        extensionCodeChallengeMethod: 'S256',
        extensionState: 'state-123',
        extensionRedirectUri: ALLOWED_REDIRECT_URI,
      },
    })
  },

  'GET /login/extension/google rejects missing extensionId in session': async () => {
    let called = false
    const { app } = buildAppWithSession({
      extensionCodeChallenge: 'challenge-123',
      extensionCodeChallengeMethod: 'S256',
      extensionState: 'state-123',
      extensionRedirectUri: ALLOWED_REDIRECT_URI,
    })
    const response = await withPatchedPassportAuthenticate(() => {
      called = true
      return (_, res) => res.status(204).end()
    }, async () => request(app).get('/api/auth/login/extension/google'))

    expect(response.status).to.equal(400)
    expect(response.body).to.deep.equal({ error: 'Session missing or invalid extensionId' })
    expect(called).to.equal(false)
  },

  'GET /login/extension/google rejects missing PKCE params in session': async () => {
    let called = false
    const { app } = buildAppWithSession({
      extensionId: ALLOWED_EXTENSION_ID,
      extensionRedirectUri: ALLOWED_REDIRECT_URI,
    })
    const response = await withPatchedPassportAuthenticate(() => {
      called = true
      return (_, res) => res.status(204).end()
    }, async () => request(app).get('/api/auth/login/extension/google'))

    expect(response.status).to.equal(400)
    expect(response.body).to.deep.equal({ error: 'Session missing PKCE parameters' })
    expect(called).to.equal(false)
  },

  'GET /login/extension/google rejects missing redirect_uri in session': async () => {
    let called = false
    const { app } = buildAppWithSession({
      extensionId: ALLOWED_EXTENSION_ID,
      extensionCodeChallenge: 'challenge-123',
      extensionCodeChallengeMethod: 'S256',
      extensionState: 'state-123',
    })
    const response = await withPatchedPassportAuthenticate(() => {
      called = true
      return (_, res) => res.status(204).end()
    }, async () => request(app).get('/api/auth/login/extension/google'))

    expect(response.status).to.equal(400)
    expect(response.body).to.deep.equal({ error: 'Session missing or invalid redirect_uri' })
    expect(called).to.equal(false)
  },

  'GET /login/google/return restores extension PKCE session and redirects back to /login/extension': async () => {
    const { app, getSession } = buildAppWithSession({})
    const response = await withPatchedPassportAuthenticate((strategy, handler) => {
      return (req, res, next) => {
        expect(strategy).to.equal('openidconnect')
        return handler(null, { id: 42 }, {
          state: {
            returnToExtension: true,
            extensionId: ALLOWED_EXTENSION_ID,
            extensionCodeChallenge: 'challenge-from-oidc',
            extensionCodeChallengeMethod: 'S256',
            extensionState: 'state-from-oidc',
            extensionRedirectUri: ALLOWED_REDIRECT_URI,
          },
        })
      }
    }, async () =>
      request(app).get('/api/auth/login/google/return').query({ code: 'oidc-code', state: 'opaque-state' }),
    )

    expect(response.status).to.equal(302)
    expect(response.headers.location).to.equal('https://fomoplayer.com/api/auth/login/extension')
    const sessionStore = getSession()
    expect(sessionStore.extensionId).to.equal(ALLOWED_EXTENSION_ID)
    expect(sessionStore.extensionCodeChallenge).to.equal('challenge-from-oidc')
    expect(sessionStore.extensionCodeChallengeMethod).to.equal('S256')
    expect(sessionStore.extensionState).to.equal('state-from-oidc')
    expect(sessionStore.extensionRedirectUri).to.equal(ALLOWED_REDIRECT_URI)
  },

  'GET /login/google/return extension PKCE session survives passport session regeneration': async () => {
    const { app, getSession } = buildAppWithSession({
      extensionId: ALLOWED_EXTENSION_ID,
      extensionCodeChallenge: 'pre-oidc-challenge',
      extensionCodeChallengeMethod: 'S256',
      extensionState: 'pre-oidc-state',
      extensionRedirectUri: ALLOWED_REDIRECT_URI,
    })
    await withPatchedPassportAuthenticate((strategy, handler) => {
      return (req, res, next) => {
        return handler(null, { id: 42 }, {
          state: {
            returnToExtension: true,
            extensionId: ALLOWED_EXTENSION_ID,
            extensionCodeChallenge: 'challenge-from-oidc',
            extensionCodeChallengeMethod: 'S256',
            extensionState: 'state-from-oidc',
            extensionRedirectUri: ALLOWED_REDIRECT_URI,
          },
        })
      }
    }, async () =>
      request(app).get('/api/auth/login/google/return').query({ code: 'oidc-code', state: 'opaque-state' }),
    )

    const sessionStore = getSession()
    expect(sessionStore.extensionId).to.equal(ALLOWED_EXTENSION_ID)
    expect(sessionStore.extensionCodeChallenge).to.equal('challenge-from-oidc')
    expect(sessionStore.extensionCodeChallengeMethod).to.equal('S256')
    expect(sessionStore.extensionState).to.equal('state-from-oidc')
    expect(sessionStore.extensionRedirectUri).to.equal(ALLOWED_REDIRECT_URI)
  },

  'GET /login/google/return rejects extension OIDC callback with disallowed extensionId in state': async () => {
    const { app } = buildAppWithSession({})
    const response = await withPatchedPassportAuthenticate((strategy, handler) => {
      return (req, res, next) =>
        handler(null, { id: 42 }, {
          state: {
            returnToExtension: true,
            extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
            extensionCodeChallenge: 'challenge-from-oidc',
            extensionCodeChallengeMethod: 'S256',
            extensionState: 'state-from-oidc',
            extensionRedirectUri: ALLOWED_REDIRECT_URI,
          },
        })
    }, async () =>
      request(app).get('/api/auth/login/google/return').query({ code: 'oidc-code', state: 'opaque-state' }),
    )

    expect(response.status).to.equal(302)
    expect(response.headers.location).to.match(/loginFailed=true/)
  },
})
