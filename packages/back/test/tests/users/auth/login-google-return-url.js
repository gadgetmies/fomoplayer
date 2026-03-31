const assert = require('assert')
const express = require('express')
const request = require('supertest')
const passport = require('passport')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')
const { parseOriginRegexes } = require('../../../../cors-origin')

const createSessionMiddleware = (session = {}) => (req, _, next) => {
  req.session = { ...session }
  req.sessionID = 'session-1'
  next()
}

const createApp = (config, tokenServer, session) => {
  const app = express()
  app.use(express.json())
  app.use(createSessionMiddleware(session))
  app.use('/api/auth', createAuthRouter({ config, tokenServer }))
  return app
}

const baseConfig = {
  apiURL: 'https://fomoplayer.com/api',
  frontendURL: 'https://fomoplayer.com',
  allowedOrigins: [],
  allowedOriginRegexes: parseOriginRegexes('^https://pr-[0-9]+\\.preview\\.example\\.com$'),
  googleOidcApiRedirect: 'https://fomoplayer.com/api/auth/login/google/return',
  internalAuthHandoffPrivateKey: '-----BEGIN PRIVATE KEY-----\ntest\n-----END PRIVATE KEY-----',
  internalAuthHandoffIssuer: 'https://fomoplayer.com',
  internalAuthApiAudience: 'https://api.preview.example.com',
  googleClientId: 'google-client-id',
}

test({
  'login/google rejects return_url that does not match configured preview regex': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = () => () => {
      throw new Error('passport.authenticate should not be called for invalid return_url')
    }
    try {
      const app = createApp(baseConfig)
      const response = await request(app).get(
        '/api/auth/login/google?return_url=https%3A%2F%2Fevil.preview.example.com%2Fauth%2Fconsume',
      )
      assert.strictEqual(response.status, 400)
      assert.strictEqual(response.body.error, 'Invalid return_url')
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },

  'login/google accepts return_url that matches configured preview regex': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = () => (_req, res) => res.status(204).end()
    try {
      const app = createApp(baseConfig)
      const response = await request(app).get(
        '/api/auth/login/google?return_url=https%3A%2F%2Fpr-42.preview.example.com%2Fauth%2Fconsume',
      )
      assert.strictEqual(response.status, 204)
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },

  'login/google/return does not enforce preview allowlist on production callback': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = (_strategy, callback) => (req, res, next) =>
      callback(
        null,
        {
          oidcIssuer: 'https://accounts.google.com',
          oidcSubject: 'blocked-sub',
        },
        {
          state: {
            return_url: 'https://pr-42.preview.example.com/auth/consume',
            preview_session_id: 'session-1',
            preview_nonce: 'nonce-1',
          },
        },
      )
    try {
      const app = createApp(
        {
          ...baseConfig,
          isPreviewEnv: false,
          previewAllowedGoogleSubs: ['different-sub'],
        },
        {
          issueInternalToken: async () => 'handoff-token',
        },
      )
      const response = await request(app).get('/api/auth/login/google/return')
      assert.strictEqual(response.status, 302)
      assert.ok(response.headers.location.includes('/auth/consume?'))
      assert.ok(response.headers.location.includes('code=handoff-token'))
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },

  'login/google/return falls back to session handoff state when callback state is opaque': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = (_strategy, callback) => (_req, _res, _next) =>
      callback(
        null,
        {
          oidcIssuer: 'https://accounts.google.com',
          oidcSubject: 'sub-1',
        },
        {
          state: {},
        },
      )
    try {
      const app = createApp(
        {
          ...baseConfig,
          isPreviewEnv: false,
          previewAllowedGoogleSubs: ['sub-1'],
        },
        {
          issueInternalToken: async () => 'handoff-token',
        },
        {
          oidcHandoff: {
            returnUrl: 'https://pr-42.preview.example.com/auth/consume',
            sessionId: 'session-1',
            nonce: 'nonce-1',
          },
        },
      )
      const response = await request(app).get('/api/auth/login/google/return')
      assert.strictEqual(response.status, 302)
      assert.ok(response.headers.location.includes('/auth/consume?'))
      assert.ok(response.headers.location.includes('code=handoff-token'))
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },

  'login/google/return uses relative loginFailed redirect when frontendURL is invalid': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = (_strategy, callback) => (_req, _res, _next) => callback(null, null, { state: {} })
    try {
      const app = createApp({
        ...baseConfig,
        frontendURL: 'http://localhost:undefined',
      })
      const response = await request(app).get('/api/auth/login/google/return')
      assert.strictEqual(response.status, 302)
      assert.strictEqual(response.headers.location, '/?loginFailed=true')
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },

  'login/google delegates to callback-host auth service when callback origin differs': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = () => () => {
      throw new Error('passport.authenticate should not be called for delegated login')
    }
    try {
      const app = createApp({
        ...baseConfig,
        apiURL: 'https://pr-42.preview.example.com/api',
        googleOidcApiRedirect: 'https://fomoplayer.com/api/auth/login/google/return',
      })
      const response = await request(app).get(
        '/api/auth/login/google?return_url=https%3A%2F%2Fpr-42.preview.example.com%2Fauth%2Fconsume&invite_code=abc',
      )
      assert.strictEqual(response.status, 302)
      const delegatedUrl = new URL(response.headers.location)
      assert.strictEqual(delegatedUrl.origin, 'https://fomoplayer.com')
      assert.strictEqual(delegatedUrl.pathname, '/api/auth/login/google')
      assert.strictEqual(delegatedUrl.searchParams.get('return_url'), 'https://pr-42.preview.example.com/auth/consume')
      assert.strictEqual(delegatedUrl.searchParams.get('invite_code'), 'abc')
      assert.strictEqual(delegatedUrl.searchParams.get('preview_session_id'), 'session-1')
      assert.ok(delegatedUrl.searchParams.get('preview_nonce'))
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },

  'login/google does not delegate when already on callback-host service': async () => {
    const originalAuthenticate = passport.authenticate
    passport.authenticate = () => (_req, res) => res.status(204).end()
    try {
      const app = createApp({
        ...baseConfig,
        apiURL: 'https://pr-42.preview.example.com/api',
        googleOidcApiRedirect: 'https://fomoplayer.com/api/auth/login/google/return',
      })
      const response = await request(app)
        .get('/api/auth/login/google?return_url=https%3A%2F%2Fpr-42.preview.example.com%2Fauth%2Fconsume')
        .set('host', 'fomoplayer.com')
      assert.strictEqual(response.status, 204)
    } finally {
      passport.authenticate = originalAuthenticate
    }
  },
})
