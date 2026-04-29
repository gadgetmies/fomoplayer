'use strict'
const { expect } = require('chai')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const FRONTEND_URL = 'https://preview.fomoplayer.com'
const API_ORIGIN = 'https://preview.fomoplayer.com'
const AUTHORITY_ORIGIN = 'https://production.fomoplayer.com'
const OIDC_ISSUER = 'accounts.google.com'
const OIDC_SUBJECT = 'google-sub-handoff-signup-test'
const LOGIN_FAILED_URL = `${FRONTEND_URL}/?loginFailed=true`

const baseConfig = {
  frontendURL: FRONTEND_URL,
  apiOrigin: API_ORIGIN,
  allowedOrigins: [],
  allowedOriginRegexes: [],
  oidcHandoffUrl: `${AUTHORITY_ORIGIN}/api/auth/login/google`,
  oidcHandoffAuthorityOrigin: AUTHORITY_ORIGIN,
  oidcHandoffSecret: 'test-handoff-secret',
  maxAccountCount: 5,
  isPreviewEnv: true,
  previewAllowedGoogleSubs: [OIDC_SUBJECT],
}

const validPayload = {
  oidcIssuer: OIDC_ISSUER,
  sub: OIDC_SUBJECT,
  jti: 'test-jti',
  exp: Math.floor(Date.now() / 1000) + 60,
}

const createApp = ({ session = {}, account, queryAccountCount, deleteInviteCode, consumeHandoffJti = () => true, verifyHandoffTokenFn = () => validPayload }) => {
  const app = express()
  app.use((req, _, next) => {
    req.session = session
    req.login = (user, cb) => { req.user = user; cb() }
    next()
  })
  app.use('/api/auth', createAuthRouter({ account, queryAccountCount, deleteInviteCode, consumeHandoffJti, verifyHandoffTokenFn, config: baseConfig }))
  return app
}

const signupClosedRejectionCases = [
  { scenario: 'no invite code in session', inviteCode: undefined },
  { scenario: 'invalid invite code in session', inviteCode: 'wrong-code' },
]

test({
  ...Object.fromEntries(
    signupClosedRejectionCases.map(({ scenario, inviteCode }) => [
      `signup closed — ${scenario}`,
      {
        setup: async () => {
          let accountCreated = false
          const app = createApp({
            session: { inviteCode },
            account: {
              findByIdentifier: async () => null,
              findOrCreateByIdentifier: async () => { accountCreated = true; return { id: 1 } },
            },
            queryAccountCount: async () => 999,
            deleteInviteCode: async () => 0,
          })
          const response = await request(app).get('/api/auth/login/google/handoff?token=test-token')
          return { response, accountCreated }
        },
        'redirects to login failed URL': async ({ response }) => {
          expect(response.status).to.equal(302)
          expect(response.headers.location).to.equal(LOGIN_FAILED_URL)
        },
        'does not create a new account': async ({ accountCreated }) => {
          expect(accountCreated).to.equal(false)
        },
      },
    ])
  ),

  'signup closed — valid invite code': {
    setup: async () => {
      let createdWith
      let deleteCalledWith
      const app = createApp({
        session: { inviteCode: 'valid-invite' },
        account: {
          findByIdentifier: async () => null,
          findOrCreateByIdentifier: async (issuer, subject) => {
            createdWith = { issuer, subject }
            return { id: 42 }
          },
        },
        queryAccountCount: async () => 999,
        deleteInviteCode: async (code) => { deleteCalledWith = code; return 1 },
      })
      const response = await request(app).get('/api/auth/login/google/handoff?token=test-token')
      return { response, createdWith, deleteCalledWith }
    },
    'redirects to frontend': async ({ response }) => {
      expect(response.status).to.equal(302)
      expect(response.headers.location).to.equal(FRONTEND_URL)
    },
    'creates account with OIDC identity from the token': async ({ createdWith }) => {
      expect(createdWith).to.deep.equal({ issuer: OIDC_ISSUER, subject: OIDC_SUBJECT })
    },
    'consumes the invite code': async ({ deleteCalledWith }) => {
      expect(deleteCalledWith).to.equal('valid-invite')
    },
  },

  'signup closed — existing user logs in without invite code': {
    setup: async () => {
      let accountCreated = false
      const app = createApp({
        session: {},
        account: {
          findByIdentifier: async () => ({ id: 99 }),
          findOrCreateByIdentifier: async () => { accountCreated = true; return { id: 99 } },
        },
        queryAccountCount: async () => 999,
        deleteInviteCode: async () => 0,
      })
      const response = await request(app).get('/api/auth/login/google/handoff?token=test-token')
      return { response, accountCreated }
    },
    'redirects to frontend': async ({ response }) => {
      expect(response.status).to.equal(302)
      expect(response.headers.location).to.equal(FRONTEND_URL)
    },
    'does not attempt to create an already-existing account': async ({ accountCreated }) => {
      expect(accountCreated).to.equal(false)
    },
  },
})
