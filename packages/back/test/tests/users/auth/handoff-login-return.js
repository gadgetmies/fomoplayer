'use strict'
const { expect } = require('chai')
const express = require('express')
const passport = require('passport')
const CustomStrategy = require('passport-custom').Strategy
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const FRONTEND_URL = 'https://previewbase.fomoplayer.test'
const AUTHORITY_ORIGIN = 'https://previewbase.fomoplayer.test'
const CONSUMER_ORIGIN = 'https://fomoplayer-fomoplayer-pr-42.up.railway.app'
const HANDOFF_SECRET = 'test-handoff-secret'
const LOGIN_FAILED_URL = `${FRONTEND_URL}/?loginFailed=true`

const PR_PREVIEW_REGEXES = [/^https:\/\/fomoplayer-fomoplayer-pr-\d+\.up\.railway\.app$/i]

const authorityConfig = (overrides = {}) => ({
  frontendURL: FRONTEND_URL,
  apiOrigin: AUTHORITY_ORIGIN,
  allowedOrigins: [],
  allowedOriginRegexes: [],
  oidcHandoffSecret: HANDOFF_SECRET,
  handoffTargetOriginRegexes: PR_PREVIEW_REGEXES,
  maxAccountCount: 5,
  isPreviewEnv: true,
  isProduction: false,
  previewAllowedGoogleSubs: ['google-sub-handoff-test'],
  ...overrides,
})

const consumerConfig = (overrides = {}) => ({
  frontendURL: CONSUMER_ORIGIN,
  apiOrigin: CONSUMER_ORIGIN,
  allowedOrigins: [],
  allowedOriginRegexes: [],
  oidcHandoffUrl: `${AUTHORITY_ORIGIN}/api/auth/login/google`,
  oidcHandoffAuthorityOrigin: AUTHORITY_ORIGIN,
  oidcHandoffSecret: HANDOFF_SECRET,
  maxAccountCount: 5,
  isPreviewEnv: true,
  isProduction: false,
  previewAllowedGoogleSubs: ['google-sub-handoff-test'],
  ...overrides,
})

const fakeOidcUser = {
  id: 7,
  oidcIdentity: { issuer: 'accounts.google.com', subject: 'google-sub-handoff-test' },
}

const registerStrategy = ({ user = fakeOidcUser, info } = {}) => {
  passport.use(
    'openidconnect',
    new CustomStrategy((req, done) => {
      done(null, user, info ?? { state: {} })
    }),
  )
}

const captureLogs = () => {
  const entries = []
  const make = (level) => (message, meta) => {
    entries.push({ level, message, meta: meta ?? null })
  }
  return {
    entries,
    logger: {
      warn: make('warn'),
      error: make('error'),
      info: make('info'),
      debug: make('debug'),
    },
  }
}

const buildAuthorityApp = ({
  preLoggedInUser = null,
  config = authorityConfig(),
  mintToken = 'mint-token-1',
} = {}) => {
  const { entries, logger } = captureLogs()
  let loginCalled = 0
  const app = express()
  app.use(passport.initialize())
  app.use((req, _res, next) => {
    req.session = {}
    req.user = preLoggedInUser
    req.isAuthenticated = () => Boolean(req.user)
    req.login = (user, cb) => {
      loginCalled += 1
      req.user = user
      cb()
    }
    next()
  })
  app.use(
    '/api/auth',
    createAuthRouter({
      config,
      mintHandoffTokenFn: () => ({ token: mintToken, jti: 'mint-jti-1' }),
      logger,
    }),
  )
  return { app, entries, getLoginCallCount: () => loginCalled }
}

const buildConsumerApp = ({ config = consumerConfig() } = {}) => {
  const { entries, logger } = captureLogs()
  const app = express()
  app.use(passport.initialize())
  app.use((req, _res, next) => {
    req.session = {}
    req.isAuthenticated = () => false
    req.login = (_user, cb) => cb()
    next()
  })
  app.use('/api/auth', createAuthRouter({ config, logger }))
  return { app, entries }
}

test({
  'authority cold-start: /login/google/return mints handoff and 302s to consumer': {
    setup: async () => {
      const stateValue = { returnPath: '/dashboard', handoffTarget: CONSUMER_ORIGIN }
      registerStrategy({ info: { state: stateValue } })
      const { app, entries, getLoginCallCount } = buildAuthorityApp()
      const response = await request(app).get('/api/auth/login/google/return?code=abc')
      return { response, entries, loginCalls: getLoginCallCount() }
    },
    'redirects to consumer handoff URL with token and returnPath': async ({ response }) => {
      expect(response.status).to.equal(302)
      const location = response.headers.location
      expect(location).to.include(`${CONSUMER_ORIGIN}/api/auth/login/google/handoff`)
      expect(location).to.include('token=mint-token-1')
      expect(location).to.include('returnPath=%2Fdashboard')
    },
    'does not call req.login on the authority': async ({ loginCalls }) => {
      expect(loginCalls).to.equal(0)
    },
    'does not log a handoff failure reason': async ({ entries }) => {
      const failureReasons = entries
        .filter((e) => e.level === 'warn' || e.level === 'error')
        .map((e) => e.meta?.reason)
        .filter(Boolean)
      expect(failureReasons).to.not.include('handoff-target-unsafe')
      expect(failureReasons).to.not.include('handoff-mint-failed')
      expect(failureReasons).to.not.include('state-missing-handoff-target')
      expect(failureReasons).to.not.include('oidc-identity-missing')
    },
  },

  'authority with existing user session: still takes the handoff branch': {
    setup: async () => {
      const stateValue = { returnPath: '/', handoffTarget: CONSUMER_ORIGIN }
      registerStrategy({ info: { state: stateValue } })
      const preLoggedInUser = { id: 7, name: 'pre-existing' }
      const { app, getLoginCallCount } = buildAuthorityApp({ preLoggedInUser })
      const response = await request(app).get('/api/auth/login/google/return?code=abc')
      return { response, loginCalls: getLoginCallCount() }
    },
    'redirects to consumer handoff URL even with pre-existing authority session': async ({ response }) => {
      expect(response.status).to.equal(302)
      expect(response.headers.location).to.include(
        `${CONSUMER_ORIGIN}/api/auth/login/google/handoff?token=mint-token-1`,
      )
    },
    'does NOT call req.login a second time on authority for the consumer flow': async ({ loginCalls }) => {
      expect(loginCalls).to.equal(0)
    },
  },

  'authority pre-OIDC: rejects handoffTarget with allowlist-not-configured when regexes are empty': {
    setup: async () => {
      registerStrategy({ info: { state: {} } })
      const { app, entries } = buildAuthorityApp({
        config: authorityConfig({ handoffTargetOriginRegexes: [] }),
      })
      const response = await request(app).get(
        `/api/auth/login/google?returnPath=%2F&handoffTarget=${encodeURIComponent(CONSUMER_ORIGIN)}`,
      )
      return { response, entries }
    },
    'redirects to login failed': async ({ response }) => {
      expect(response.status).to.equal(302)
      expect(response.headers.location).to.equal(LOGIN_FAILED_URL)
    },
    'log includes reason and subReason': async ({ entries }) => {
      const match = entries.find(
        (e) => e.meta?.reason === 'handoff-target-unsafe' && e.meta?.subReason === 'allowlist-not-configured',
      )
      expect(match, 'expected handoff-target-unsafe / allowlist-not-configured log entry').to.exist
    },
  },

  'authority pre-OIDC: rejects handoffTarget with origin-not-allowed when regex does not match': {
    setup: async () => {
      registerStrategy({ info: { state: {} } })
      const { app, entries } = buildAuthorityApp()
      const response = await request(app).get(
        `/api/auth/login/google?returnPath=%2F&handoffTarget=${encodeURIComponent('https://evil.example.com')}`,
      )
      return { response, entries }
    },
    'redirects to login failed': async ({ response }) => {
      expect(response.status).to.equal(302)
      expect(response.headers.location).to.equal(LOGIN_FAILED_URL)
    },
    'log includes reason and subReason origin-not-allowed': async ({ entries }) => {
      const match = entries.find(
        (e) => e.meta?.reason === 'handoff-target-unsafe' && e.meta?.subReason === 'origin-not-allowed',
      )
      expect(match, 'expected handoff-target-unsafe / origin-not-allowed log entry').to.exist
    },
  },

  'authority startup: warns when handoff issuer is enabled but allowlist is empty': {
    setup: async () => {
      const { entries, logger } = captureLogs()
      const app = express()
      app.use(
        '/api/auth',
        createAuthRouter({
          config: authorityConfig({ handoffTargetOriginRegexes: [] }),
          logger,
        }),
      )
      void app
      return { entries }
    },
    'emits one startup warning': async ({ entries }) => {
      const warnings = entries.filter(
        (e) => e.level === 'warn' && /HANDOFF_TARGET_ORIGIN_REGEX/.test(e.message ?? ''),
      )
      expect(warnings.length, 'expected exactly one allowlist startup warning').to.equal(1)
    },
  },

  'authority startup: silent when allowlist is configured': {
    setup: async () => {
      const { entries, logger } = captureLogs()
      const app = express()
      app.use(
        '/api/auth',
        createAuthRouter({ config: authorityConfig(), logger }),
      )
      void app
      return { entries }
    },
    'no allowlist startup warning': async ({ entries }) => {
      const warnings = entries.filter(
        (e) => e.level === 'warn' && /HANDOFF_TARGET_ORIGIN_REGEX/.test(e.message ?? ''),
      )
      expect(warnings.length).to.equal(0)
    },
  },

  'authority startup: silent when handoff issuer is not enabled (no secret)': {
    setup: async () => {
      const { entries, logger } = captureLogs()
      const app = express()
      app.use(
        '/api/auth',
        createAuthRouter({
          config: authorityConfig({ oidcHandoffSecret: undefined, handoffTargetOriginRegexes: [] }),
          logger,
        }),
      )
      void app
      return { entries }
    },
    'no allowlist warning when canMintHandoff is false': async ({ entries }) => {
      const warnings = entries.filter(
        (e) => e.level === 'warn' && /HANDOFF_TARGET_ORIGIN_REGEX/.test(e.message ?? ''),
      )
      expect(warnings.length).to.equal(0)
    },
  },

  'consumer /login/google: 302s to authority with returnPath and handoffTarget set to request origin': {
    setup: async () => {
      const { app } = buildConsumerApp()
      const response = await request(app)
        .get('/api/auth/login/google?returnPath=%2F')
        .set('Host', new URL(CONSUMER_ORIGIN).host)
        .set('X-Forwarded-Proto', 'https')
        .set('X-Forwarded-Host', new URL(CONSUMER_ORIGIN).host)
      return { response }
    },
    'redirects to authority handoffUrl': async ({ response }) => {
      expect(response.status).to.equal(302)
      const location = new URL(response.headers.location)
      expect(`${location.protocol}//${location.host}${location.pathname}`).to.equal(
        `${AUTHORITY_ORIGIN}/api/auth/login/google`,
      )
      expect(location.searchParams.get('returnPath')).to.equal('/')
      expect(location.searchParams.get('handoffTarget')).to.equal(CONSUMER_ORIGIN)
    },
  },
})
