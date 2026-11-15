'use strict'

const { expect } = require('chai')
const express = require('express')
const request = require('supertest')
const passport = require('passport')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')
const { createUsedChallengeStore } = require('../../../../routes/shared/cli-auth-code')

const cliLinkQuery = (codeChallenge) => ({
  callbackPort: 43110,
  code_challenge: codeChallenge,
  code_challenge_method: 'S256',
  state: 'cli-state-1',
})

const baseConfig = {
  frontendURL: 'https://fomoplayer.com',
  apiOrigin: 'https://fomoplayer.com',
  allowedOrigins: [],
  allowedOriginRegexes: [],
  isPreviewEnv: false,
  previewAllowedGoogleSubs: [],
  maxAccountCount: 100,
}

const buildAppWithSession = (
  session = {},
  { usedChallenges = createUsedChallengeStore(), issueCodeFn = () => 'issued-code' } = {},
) => {
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
  app.use('/api/auth', createAuthRouter({ config: baseConfig, usedChallenges, issueCodeFn }))
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
  'GET /login/cli shows "already used" instead of consent after the link was approved': async () => {
    const issued = []
    const { app, getSession } = buildAppWithSession(
      { userId: 42 },
      {
        issueCodeFn: (userId, codeChallenge) => {
          issued.push(codeChallenge)
          return `code-${issued.length}`
        },
      },
    )

    const consent = await request(app).get('/api/auth/login/cli').query(cliLinkQuery('approved-challenge'))
    expect(consent.text).to.include('Grant CLI access?')
    const confirm = await request(app).post('/api/auth/login/cli/confirm')
    expect(confirm.status).to.equal(302)
    expect(confirm.headers.location).to.equal('http://localhost:43110/?code=code-1&state=cli-state-1')

    const reopened = await request(app).get('/api/auth/login/cli').query(cliLinkQuery('approved-challenge'))
    expect(reopened.status).to.equal(410)
    expect(reopened.text).to.include('This link has already been used')
    expect(reopened.text).to.not.include('Grant CLI access?')
    expect(getSession().cliCodeChallenge).to.equal(undefined)

    const reconfirm = await request(app).post('/api/auth/login/cli/confirm')
    expect(reconfirm.status).to.equal(400)
    expect(issued).to.deep.equal(['approved-challenge'])
  },

  'POST /login/cli/confirm issues no second code for an already approved request': async () => {
    const issued = []
    const usedChallenges = createUsedChallengeStore()
    const pending = {
      userId: 42,
      cliCallbackPort: 43110,
      cliCodeChallenge: 'double-submit',
      cliCodeChallengeMethod: 'S256',
      cliState: 'cli-state-1',
    }
    const issueCodeFn = (userId, codeChallenge) => {
      issued.push(codeChallenge)
      return 'code'
    }
    // Two sessions (e.g. two tabs) holding the same pending request.
    const first = await request(buildAppWithSession(pending, { usedChallenges, issueCodeFn }).app).post(
      '/api/auth/login/cli/confirm',
    )
    const second = await request(buildAppWithSession(pending, { usedChallenges, issueCodeFn }).app).post(
      '/api/auth/login/cli/confirm',
    )
    expect(first.status).to.equal(302)
    expect(second.status).to.equal(410)
    expect(second.text).to.include('This link has already been used')
    expect(issued).to.deep.equal(['double-submit'])
  },

  'GET /login/cli shows "already used" after the link was denied': async () => {
    const { app, getSession } = buildAppWithSession({ userId: 42 })
    await request(app).get('/api/auth/login/cli').query(cliLinkQuery('denied-challenge'))
    const deny = await request(app).post('/api/auth/login/cli/deny')
    expect(deny.text).to.include('Access denied')
    expect(getSession().cliCodeChallenge).to.equal(undefined)

    const reopened = await request(app).get('/api/auth/login/cli').query(cliLinkQuery('denied-challenge'))
    expect(reopened.status).to.equal(410)
    expect(reopened.text).to.include('This link has already been used')

    const fresh = await request(app).get('/api/auth/login/cli').query(cliLinkQuery('new-challenge'))
    expect(fresh.status).to.equal(200)
    expect(fresh.text).to.include('Grant CLI access?')
  },

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
