'use strict'

const { expect } = require('chai')
const express = require('express')
const request = require('supertest')
const passport = require('passport')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const baseConfig = {
  frontendURL: 'https://fomoplayer.com',
  apiOrigin: 'https://fomoplayer.com',
  allowedOrigins: [],
  allowedOriginRegexes: [],
  isPreviewEnv: false,
  previewAllowedGoogleSubs: [],
  maxAccountCount: 100,
}

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
  app.use('/api/auth', createAuthRouter({ config: baseConfig }))
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
  'GET /login/cli shows login-failed page even when authenticated': async () => {
    const { app } = buildAppWithSession({ userId: 42 })
    const response = await request(app).get('/api/auth/login/cli').query({
      callbackPort: 43110,
      code_challenge: 'pkce-challenge',
      code_challenge_method: 'S256',
      state: 'cli-state-1',
      loginFailed: 'true',
    })

    expect(response.status).to.equal(200)
    expect(response.text).to.include('CLI login failed')
    expect(response.text).to.not.include('Grant CLI access?')
  },

  'GET /login/cli shows consent page when authenticated without loginFailed flag': async () => {
    const { app } = buildAppWithSession({ userId: 42 })
    const response = await request(app).get('/api/auth/login/cli').query({
      callbackPort: 43110,
      code_challenge: 'pkce-challenge',
      code_challenge_method: 'S256',
      state: 'cli-state-1',
    })

    expect(response.status).to.equal(200)
    expect(response.text).to.include('Grant CLI access?')
    expect(response.text).to.not.include('CLI login failed')
  },

  'GET /login/cli/google carries CLI PKCE fields via OIDC state': async () => {
    const calls = []
    const { app } = buildAppWithSession({
      cliCodeChallenge: 'challenge-123',
      cliCodeChallengeMethod: 'S256',
      cliState: 'state-123',
    })
    const response = await withPatchedPassportAuthenticate((strategy, options) => {
      calls.push({ strategy, options })
      return (_, res) => res.status(204).end()
    }, async () =>
      request(app).get('/api/auth/login/cli/google').query({ callbackPort: 43110 }),
    )

    expect(response.status).to.equal(204)
    expect(calls).to.have.length(1)
    expect(calls[0].strategy).to.equal('openidconnect')
    expect(calls[0].options).to.deep.equal({
      state: {
        returnToCli: true,
        cliCallbackPort: 43110,
        cliCodeChallenge: 'challenge-123',
        cliCodeChallengeMethod: 'S256',
        cliState: 'state-123',
      },
    })
  },

  'GET /login/cli/google rejects missing PKCE values in session': async () => {
    let called = false
    const { app } = buildAppWithSession({ cliCodeChallengeMethod: 'S256' })
    const response = await withPatchedPassportAuthenticate(() => {
      called = true
      return (_, res) => res.status(204).end()
    }, async () =>
      request(app).get('/api/auth/login/cli/google').query({ callbackPort: 43110 }),
    )

    expect(response.status).to.equal(400)
    expect(response.body).to.deep.equal({ error: 'Session missing PKCE parameters' })
    expect(called).to.equal(false)
  },

  'GET /login/google/return restores CLI PKCE session and redirects back to /login/cli': async () => {
    const { app, getSession } = buildAppWithSession({})
    const response = await withPatchedPassportAuthenticate((strategy, handler) => {
      return (req, res, next) => {
        expect(strategy).to.equal('openidconnect')
        return handler(null, { id: 42 }, {
          state: {
            returnToCli: true,
            cliCallbackPort: '43110',
            cliCodeChallenge: 'challenge-from-oidc',
            cliCodeChallengeMethod: 'S256',
            cliState: 'state-from-oidc',
          },
        })
      }
    }, async () =>
      request(app).get('/api/auth/login/google/return').query({ code: 'oidc-code', state: 'opaque-state' }),
    )

    expect(response.status).to.equal(302)
    expect(response.headers.location).to.equal('https://fomoplayer.com/api/auth/login/cli?callbackPort=43110')
    const sessionStore = getSession()
    expect(sessionStore.cliCallbackPort).to.equal(43110)
    expect(sessionStore.cliCodeChallenge).to.equal('challenge-from-oidc')
    expect(sessionStore.cliCodeChallengeMethod).to.equal('S256')
    expect(sessionStore.cliState).to.equal('state-from-oidc')
  },

  'GET /login/google/return CLI PKCE session survives passport session regeneration': async () => {
    const { app, getSession } = buildAppWithSession({
      cliCallbackPort: 43110,
      cliCodeChallenge: 'pre-oidc-challenge',
      cliCodeChallengeMethod: 'S256',
      cliState: 'pre-oidc-state',
    })
    await withPatchedPassportAuthenticate((strategy, handler) => {
      return (req, res, next) => {
        return handler(null, { id: 42 }, {
          state: {
            returnToCli: true,
            cliCallbackPort: '43110',
            cliCodeChallenge: 'challenge-from-oidc',
            cliCodeChallengeMethod: 'S256',
            cliState: 'state-from-oidc',
          },
        })
      }
    }, async () =>
      request(app).get('/api/auth/login/google/return').query({ code: 'oidc-code', state: 'opaque-state' }),
    )

    const sessionStore = getSession()
    expect(sessionStore.cliCodeChallenge).to.equal('challenge-from-oidc')
    expect(sessionStore.cliCodeChallengeMethod).to.equal('S256')
    expect(sessionStore.cliState).to.equal('state-from-oidc')
    expect(sessionStore.cliCallbackPort).to.equal(43110)
  },
})
