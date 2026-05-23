'use strict'

const { expect } = require('chai')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const FRONTEND_URL = 'https://preview.fomoplayer.com'
const API_ORIGIN = 'https://preview-pr-1.up.railway.app'
const ALLOWED_REPO = 'owner/fomoplayer'
const NON_ADMIN_SUB = 'repo:owner/fomoplayer:pull_request'
const ADMIN_SUB = 'repo:owner/fomoplayer:environment:preview-admin'

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
  githubActionsOidcAdminSub: ADMIN_SUB,
}

const mockAccount = (userId = 42) => ({
  findOrCreateByIdentifier: async () => ({ id: userId }),
  findByIdentifier: async () => null,
  findByUserId: async () => ({ id: userId }),
})

const createRecordingLogger = () => {
  const entries = []
  const record = (level) => (...args) => entries.push({ level, args })
  return {
    entries,
    warn: record('warn'),
    info: record('info'),
    error: record('error'),
    debug: record('debug'),
  }
}

const createApp = ({ config = previewConfig, account = mockAccount(), verifyActionsTokenFn, logger } = {}) => {
  const app = express()
  const sessions = []
  app.use(express.json())
  app.use((req, _, next) => {
    req.session = {}
    sessions.push(req.session)
    req.login = (user, cb) => {
      req.user = user
      cb()
    }
    next()
  })
  app.use('/api/auth', createAuthRouter({ account, config, verifyActionsTokenFn, logger }))
  app.lastSession = () => sessions[sessions.length - 1]
  return app
}

const validPayload = (sub = NON_ADMIN_SUB) => ({
  repository: ALLOWED_REPO,
  iss: 'https://token.actions.githubusercontent.com',
  sub,
})

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
    expect(capturedArgs.logger).to.exist
    expect(typeof capturedArgs.logger.warn).to.equal('function')
  },

  'POST /login/actions — verifier rejection does not emit the old opaque warn at the route': async () => {
    const logger = createRecordingLogger()
    const app = createApp({
      verifyActionsTokenFn: async () => null,
      logger,
    })
    const response = await request(app)
      .post('/api/auth/login/actions')
      .send({ token: 'tampered-token' })
    expect(response.status).to.equal(401)
    const opaqueWarns = logger.entries
      .filter((entry) => entry.level === 'warn')
      .filter((entry) =>
        entry.args.some(
          (arg) => typeof arg === 'string' && arg.includes('invalid or unauthorized'),
        ),
      )
    expect(opaqueWarns).to.have.length(0)
  },

  'POST /login/actions — uses findOrCreateByIdentifier with GitHub Actions issuer and the verified token sub': async () => {
    let capturedIssuer, capturedSubject
    const account = {
      findOrCreateByIdentifier: async (issuer, subject) => {
        capturedIssuer = issuer
        capturedSubject = subject
        return { id: 7 }
      },
    }
    const app = createApp({ account, verifyActionsTokenFn: async () => validPayload(NON_ADMIN_SUB) })
    await request(app).post('/api/auth/login/actions').send({ token: 'my-token' })
    expect(capturedIssuer).to.equal('token.actions.githubusercontent.com')
    expect(capturedSubject).to.equal(NON_ADMIN_SUB)
  },

  'POST /login/actions — token without a sub claim returns 401': async () => {
    const app = createApp({ verifyActionsTokenFn: async () => ({ repository: ALLOWED_REPO }) })
    const response = await request(app).post('/api/auth/login/actions').send({ token: 'no-sub-token' })
    expect(response.status).to.equal(401)
  },

  'POST /login/actions — grants admin session only for the configured admin sub': async () => {
    const app = createApp({ verifyActionsTokenFn: async () => validPayload(ADMIN_SUB) })
    const response = await request(app).post('/api/auth/login/actions').send({ token: 'admin-token' })
    expect(response.status).to.equal(204)
    expect(app.lastSession().isActionsAdmin).to.equal(true)
  },

  'POST /login/actions — does not grant admin for a non-admin sub': async () => {
    const app = createApp({ verifyActionsTokenFn: async () => validPayload(NON_ADMIN_SUB) })
    const response = await request(app).post('/api/auth/login/actions').send({ token: 'user-token' })
    expect(response.status).to.equal(204)
    expect(app.lastSession().isActionsAdmin).to.equal(false)
  },

  'POST /login/actions — does not grant admin when no admin sub is configured': async () => {
    const app = createApp({
      config: { ...previewConfig, githubActionsOidcAdminSub: undefined },
      // Even if a token presents the would-be admin sub, no config means no admin.
      verifyActionsTokenFn: async () => validPayload(ADMIN_SUB),
    })
    const response = await request(app).post('/api/auth/login/actions').send({ token: 'admin-token' })
    expect(response.status).to.equal(204)
    expect(app.lastSession().isActionsAdmin).to.equal(false)
  },
})
