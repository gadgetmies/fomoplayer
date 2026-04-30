'use strict'

const { expect } = require('chai')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const FRONTEND_URL = 'https://preview.fomoplayer.com'
const API_ORIGIN = 'https://preview-pr-1.up.railway.app'
const ALLOWED_REPO = 'owner/fomoplayer'

const previewConfig = {
  frontendURL: FRONTEND_URL,
  apiOrigin: API_ORIGIN,
  allowedOrigins: [],
  allowedOriginRegexes: [],
  oidcHandoffUrl: undefined,
  oidcHandoffAuthorityOrigin: undefined,
  oidcHandoffSecret: undefined,
  maxAccountCount: 5,
  isPreviewEnv: true,
  githubActionsOidcRepo: ALLOWED_REPO,
}

const mockAccount = (userId = 42) => ({
  findOrCreateByIdentifier: async () => ({ id: userId }),
  findByIdentifier: async () => null,
  findByUserId: async () => ({ id: userId }),
})

const createApp = ({ config = previewConfig, account = mockAccount(), verifyActionsTokenFn } = {}) => {
  const app = express()
  app.use(express.json())
  app.use((req, _, next) => {
    req.session = {}
    req.login = (user, cb) => {
      req.user = user
      cb()
    }
    next()
  })
  app.use('/api/auth', createAuthRouter({ account, config, verifyActionsTokenFn }))
  return app
}

const validPayload = () => ({ repository: ALLOWED_REPO, iss: 'https://token.actions.githubusercontent.com' })

test({
  'POST /login/actions — valid token returns 204 and establishes session': async () => {
    const app = createApp({ verifyActionsTokenFn: async () => validPayload() })
    const response = await request(app)
      .post('/api/auth/login/actions')
      .send({ token: 'valid-actions-token' })
    expect(response.status).to.equal(204)
  },

  'POST /login/actions — invalid token returns 401': async () => {
    const app = createApp({ verifyActionsTokenFn: async () => null })
    const response = await request(app)
      .post('/api/auth/login/actions')
      .send({ token: 'tampered-token' })
    expect(response.status).to.equal(401)
  },

  'POST /login/actions — missing token body returns 400': async () => {
    const app = createApp({ verifyActionsTokenFn: async () => validPayload() })
    const response = await request(app)
      .post('/api/auth/login/actions')
      .send({})
    expect(response.status).to.equal(400)
  },

  'POST /login/actions — absent when isPreviewEnv is false': async () => {
    const app = createApp({
      config: { ...previewConfig, isPreviewEnv: false },
      verifyActionsTokenFn: async () => validPayload(),
    })
    const response = await request(app)
      .post('/api/auth/login/actions')
      .send({ token: 'valid-actions-token' })
    expect(response.status).to.equal(404)
  },

  'POST /login/actions — absent when githubActionsOidcRepo is not configured': async () => {
    const app = createApp({
      config: { ...previewConfig, githubActionsOidcRepo: undefined },
      verifyActionsTokenFn: async () => validPayload(),
    })
    const response = await request(app)
      .post('/api/auth/login/actions')
      .send({ token: 'valid-actions-token' })
    expect(response.status).to.equal(404)
  },

  'POST /login/actions — verifyActionsToken is called with apiOrigin as audience and configured repo': async () => {
    let capturedArgs
    const app = createApp({
      verifyActionsTokenFn: async (args) => {
        capturedArgs = args
        return validPayload()
      },
    })
    await request(app).post('/api/auth/login/actions').send({ token: 'my-token' })
    expect(capturedArgs.token).to.equal('my-token')
    expect(capturedArgs.audience).to.equal(API_ORIGIN)
    expect(capturedArgs.allowedRepo).to.equal(ALLOWED_REPO)
  },

  'POST /login/actions — uses findOrCreateByIdentifier with GitHub Actions issuer and repo as subject': async () => {
    let capturedIssuer, capturedSubject
    const account = {
      findOrCreateByIdentifier: async (issuer, subject) => {
        capturedIssuer = issuer
        capturedSubject = subject
        return { id: 7 }
      },
    }
    const app = createApp({ account, verifyActionsTokenFn: async () => validPayload() })
    await request(app).post('/api/auth/login/actions').send({ token: 'my-token' })
    expect(capturedIssuer).to.equal('token.actions.githubusercontent.com')
    expect(capturedSubject).to.equal(ALLOWED_REPO)
  },
})
