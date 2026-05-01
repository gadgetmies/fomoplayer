'use strict'

const { expect } = require('chai')
const express = require('express')
const request = require('supertest')
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

const sessionMiddleware = (initial = {}) => {
  const sessionStore = { ...initial }
  return (req, _, next) => {
    req.session = sessionStore
    const isAuthenticated = Boolean(initial.userId)
    req.isAuthenticated = () => isAuthenticated
    if (isAuthenticated) req.user = { id: initial.userId }
    req.login = (_, cb) => cb()
    next()
  }
}

const buildApp = (session) => {
  const app = express()
  app.use(sessionMiddleware(session))
  app.use('/api/auth', createAuthRouter({ config: baseConfig }))
  return app
}

test({
  'GET /login/cli shows login-failed page even when authenticated': async () => {
    const app = buildApp({ userId: 42 })
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
    const app = buildApp({ userId: 42 })
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
})
