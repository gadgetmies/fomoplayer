'use strict'
const assert = require('assert')
const crypto = require('crypto')
const express = require('express')
const request = require('supertest')
const { test } = require('cascade-test')
const { createAuthRouter } = require('../../../../routes/auth')

const ALLOWED_EXTENSION_ID = 'abcdefghijklmnopabcdefghijklmnop'

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
  internalAuthHandoffPrivateKey: privateKeyPem,
  internalAuthHandoffKeyId: 'test-kid',
  internalAuthHandoffIssuer: 'https://fomoplayer.com',
  internalAuthApiAudience: 'https://api.fomoplayer.com',
  extensionAccessTokenTtlSeconds: 900,
  extensionRefreshTokenTtlSeconds: 60,
})

const sessionMiddleware = (initial = {}) => {
  const sessionStore = { ...initial }
  return [
    (req, _, next) => {
      req.session = sessionStore
      const isAuthenticated = Boolean(initial.userId)
      req.isAuthenticated = () => isAuthenticated
      if (isAuthenticated) req.user = { id: initial.userId }
      req.login = (user, cb) => {
        req.user = user
        cb()
      }
      next()
    },
    sessionStore,
  ]
}

const buildApp = ({ config, extensionRefreshToken, tokenServer, issueCodeFn, consumeCodeFn, session }) => {
  const [middleware, sessionStore] = sessionMiddleware(session)
  const app = express()
  app.use(express.json())
  app.use(middleware)
  app.use(
    '/api/auth',
    createAuthRouter({
      config,
      extensionRefreshToken,
      tokenServer,
      issueCodeFn,
      consumeCodeFn,
    }),
  )
  return { app, sessionStore }
}

const fakeTokenServer = () => ({
  issueInternalToken: async ({ subject, audience }) => `signed-jwt-for:${subject}:aud=${audience}`,
  getInternalPublicJwk: async () => ({ kty: 'RSA', kid: 'test-kid', alg: 'RS256', use: 'sig' }),
})

const fakeRefreshTokenStore = () => {
  const rows = new Map()
  let nextId = 1
  return {
    rows,
    createRefreshToken: async ({ userId, extensionId, rawToken, ttlSeconds }) => {
      const chainId = `chain-${nextId}`
      const id = nextId++
      rows.set(rawToken, {
        id,
        user_id: userId,
        extension_id: extensionId,
        chain_id: chainId,
        replaced_by: null,
        expires_at: new Date(Date.now() + ttlSeconds * 1000),
        revoked_at: null,
      })
      return { id, chainId }
    },
    findRefreshToken: async (rawToken) => rows.get(rawToken) ?? null,
    rotateRefreshToken: async ({ oldRowId, userId, extensionId, chainId, newRawToken, ttlSeconds }) => {
      const id = nextId++
      rows.set(newRawToken, {
        id,
        user_id: userId,
        extension_id: extensionId,
        chain_id: chainId,
        replaced_by: null,
        expires_at: new Date(Date.now() + ttlSeconds * 1000),
        revoked_at: null,
      })
      for (const row of rows.values()) {
        if (row.id === oldRowId) row.replaced_by = id
      }
      return { id }
    },
    revokeRefreshTokenByRaw: async (rawToken) => {
      const row = rows.get(rawToken)
      if (row) row.revoked_at = new Date()
    },
    revokeChain: async (chainId) => {
      for (const row of rows.values()) {
        if (row.chain_id === chainId && !row.revoked_at) row.revoked_at = new Date()
      }
    },
  }
}

test({
  'GET /login/extension returns 503 when extension flow not configured': async () => {
    const { app } = buildApp({
      config: { ...baseConfig(generatePrivateKey()), extensionOauthAllowedIds: [] },
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app).get('/api/auth/login/extension').query({ extensionId: ALLOWED_EXTENSION_ID })
    assert.strictEqual(response.status, 503)
  },

  'GET /login/extension rejects unknown extensionId': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .get('/api/auth/login/extension')
      .query({ extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', code_challenge: 'cc', code_challenge_method: 'S256', state: 's' })
    assert.strictEqual(response.status, 400)
    assert.match(response.body.error, /extensionId/)
  },

  'GET /login/extension rejects malformed extensionId': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .get('/api/auth/login/extension')
      .query({ extensionId: 'not-a-real-id', code_challenge: 'cc', code_challenge_method: 'S256', state: 's' })
    assert.strictEqual(response.status, 400)
  },

  'GET /login/extension rejects missing PKCE params': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .get('/api/auth/login/extension')
      .query({ extensionId: ALLOWED_EXTENSION_ID })
    assert.strictEqual(response.status, 400)
  },

  'GET /login/extension renders consent page when authenticated': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
      session: { userId: 7 },
    })
    const response = await request(app)
      .get('/api/auth/login/extension')
      .query({ extensionId: ALLOWED_EXTENSION_ID, code_challenge: 'cc', code_challenge_method: 'S256', state: 'st' })
    assert.strictEqual(response.status, 200)
    assert.match(response.text, /Grant extension access/)
    assert.match(response.text, /\/api\/auth\/login\/extension\/confirm/)
  },

  'GET /login/extension renders login page when unauthenticated': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .get('/api/auth/login/extension')
      .query({ extensionId: ALLOWED_EXTENSION_ID, code_challenge: 'cc', code_challenge_method: 'S256', state: 'st' })
    assert.strictEqual(response.status, 200)
    assert.match(response.text, /Continue with Google/)
    assert.match(response.text, /\/api\/auth\/login\/extension\/google/)
  },

  'POST /login/extension/confirm requires authenticated session': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app).post('/api/auth/login/extension/confirm')
    assert.strictEqual(response.status, 401)
  },

  'POST /login/extension/confirm redirects to extension chromiumapp.org with code+state': async () => {
    let issuedCode = null
    const issueCodeFn = (userId, codeChallenge) => {
      issuedCode = `code-for-${userId}-${codeChallenge}`
      return issuedCode
    }
    const { app, sessionStore } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
      issueCodeFn,
      session: {
        userId: 42,
        extensionId: ALLOWED_EXTENSION_ID,
        extensionCodeChallenge: 'challenge-1',
        extensionCodeChallengeMethod: 'S256',
        extensionState: 'state-1',
      },
    })
    const response = await request(app).post('/api/auth/login/extension/confirm')
    assert.strictEqual(response.status, 302)
    const redirectUrl = new URL(response.headers.location)
    assert.strictEqual(redirectUrl.host, `${ALLOWED_EXTENSION_ID}.chromiumapp.org`)
    assert.strictEqual(redirectUrl.searchParams.get('code'), issuedCode)
    assert.strictEqual(redirectUrl.searchParams.get('state'), 'state-1')
    assert.strictEqual(sessionStore.extensionId, undefined)
    assert.strictEqual(sessionStore.extensionCodeChallenge, undefined)
  },

  'POST /extension/token returns access JWT and refresh token for valid code': async () => {
    let consumeArgs = null
    const consumeCodeFn = (code, codeVerifier) => {
      consumeArgs = { code, codeVerifier }
      return code === 'good-code' && codeVerifier === 'verifier-1' ? { userId: 99 } : null
    }
    const refreshStore = fakeRefreshTokenStore()
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: refreshStore,
      tokenServer: fakeTokenServer(),
      consumeCodeFn,
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ code: 'good-code', code_verifier: 'verifier-1', extensionId: ALLOWED_EXTENSION_ID })
    assert.strictEqual(response.status, 200)
    assert.strictEqual(response.body.token_type, 'Bearer')
    assert.strictEqual(response.body.expires_in, 900)
    assert.strictEqual(response.body.access_token, 'signed-jwt-for:99:aud=https://api.fomoplayer.com')
    assert.match(response.body.refresh_token, /^fp_rt_/)
    assert.deepStrictEqual(consumeArgs, { code: 'good-code', codeVerifier: 'verifier-1' })
    assert.strictEqual(refreshStore.rows.size, 1)
  },

  'POST /extension/token rejects unknown extensionId on initial exchange': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
      consumeCodeFn: () => ({ userId: 1 }),
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ code: 'c', code_verifier: 'v', extensionId: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' })
    assert.strictEqual(response.status, 400)
  },

  'POST /extension/token rejects missing parameters': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ extensionId: ALLOWED_EXTENSION_ID })
    assert.strictEqual(response.status, 400)
  },

  'POST /extension/token rejects invalid code': async () => {
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
      consumeCodeFn: () => null,
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ code: 'wrong', code_verifier: 'v', extensionId: ALLOWED_EXTENSION_ID })
    assert.strictEqual(response.status, 401)
  },

  'POST /extension/token rotates refresh token on refresh': async () => {
    const refreshStore = fakeRefreshTokenStore()
    const { id, chainId } = await refreshStore.createRefreshToken({
      userId: 17,
      extensionId: ALLOWED_EXTENSION_ID,
      rawToken: 'fp_rt_initial',
      ttlSeconds: 60,
    })
    void id
    void chainId
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: refreshStore,
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ refresh_token: 'fp_rt_initial' })
    assert.strictEqual(response.status, 200)
    assert.notStrictEqual(response.body.refresh_token, 'fp_rt_initial')
    assert.match(response.body.refresh_token, /^fp_rt_/)
    const oldRow = refreshStore.rows.get('fp_rt_initial')
    assert.notStrictEqual(oldRow.replaced_by, null)
  },

  'POST /extension/token detects refresh-token reuse and revokes chain': async () => {
    const refreshStore = fakeRefreshTokenStore()
    await refreshStore.createRefreshToken({
      userId: 23,
      extensionId: ALLOWED_EXTENSION_ID,
      rawToken: 'fp_rt_first',
      ttlSeconds: 60,
    })
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: refreshStore,
      tokenServer: fakeTokenServer(),
    })

    const firstRefresh = await request(app)
      .post('/api/auth/extension/token')
      .send({ refresh_token: 'fp_rt_first' })
    assert.strictEqual(firstRefresh.status, 200)

    const reuseResponse = await request(app)
      .post('/api/auth/extension/token')
      .send({ refresh_token: 'fp_rt_first' })
    assert.strictEqual(reuseResponse.status, 401)
    assert.match(reuseResponse.body.error, /reuse/)

    const newRow = refreshStore.rows.get(firstRefresh.body.refresh_token)
    assert.notStrictEqual(newRow.revoked_at, null)
  },

  'POST /extension/token rejects expired refresh token': async () => {
    const refreshStore = fakeRefreshTokenStore()
    await refreshStore.createRefreshToken({
      userId: 31,
      extensionId: ALLOWED_EXTENSION_ID,
      rawToken: 'fp_rt_old',
      ttlSeconds: -10,
    })
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: refreshStore,
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ refresh_token: 'fp_rt_old' })
    assert.strictEqual(response.status, 401)
  },

  'POST /extension/token rejects revoked refresh token': async () => {
    const refreshStore = fakeRefreshTokenStore()
    await refreshStore.createRefreshToken({
      userId: 32,
      extensionId: ALLOWED_EXTENSION_ID,
      rawToken: 'fp_rt_revoked',
      ttlSeconds: 60,
    })
    await refreshStore.revokeRefreshTokenByRaw('fp_rt_revoked')
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: refreshStore,
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({ refresh_token: 'fp_rt_revoked' })
    assert.strictEqual(response.status, 401)
  },

  'POST /extension/logout revokes refresh token': async () => {
    const refreshStore = fakeRefreshTokenStore()
    await refreshStore.createRefreshToken({
      userId: 41,
      extensionId: ALLOWED_EXTENSION_ID,
      rawToken: 'fp_rt_logout',
      ttlSeconds: 60,
    })
    const { app } = buildApp({
      config: baseConfig(generatePrivateKey()),
      extensionRefreshToken: refreshStore,
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .post('/api/auth/extension/logout')
      .send({ refresh_token: 'fp_rt_logout' })
    assert.strictEqual(response.status, 204)
    const row = refreshStore.rows.get('fp_rt_logout')
    assert.notStrictEqual(row.revoked_at, null)
  },

  'GET /.well-known/jwks.json publishes public key when private key configured': async () => {
    const privateKeyPem = generatePrivateKey()
    const { app } = buildApp({
      config: baseConfig(privateKeyPem),
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app).get('/api/auth/.well-known/jwks.json')
    assert.strictEqual(response.status, 200)
    assert.ok(Array.isArray(response.body.keys))
    assert.strictEqual(response.body.keys.length, 1)
    assert.strictEqual(response.body.keys[0].kid, 'test-kid')
    assert.strictEqual(response.body.keys[0].alg, 'RS256')
  },

  'GET /.well-known/jwks.json returns 404 when not configured': async () => {
    const { app } = buildApp({
      config: { ...baseConfig(generatePrivateKey()), internalAuthHandoffPrivateKey: undefined },
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app).get('/api/auth/.well-known/jwks.json')
    assert.strictEqual(response.status, 404)
  },

  'GET /login/extension rejects redirect_uri that is not in the allowlist': async () => {
    const { app } = buildApp({
      config: {
        ...baseConfig(generatePrivateKey()),
        extensionOauthAllowedRedirectPatterns: [/^chrome-extension:\/\/[a-p]{32}\/auth-callback\.html$/],
      },
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
    })
    const response = await request(app)
      .get('/api/auth/login/extension')
      .query({
        extensionId: ALLOWED_EXTENSION_ID,
        code_challenge: 'cc',
        code_challenge_method: 'S256',
        state: 'st',
        redirect_uri: 'https://evil.example/callback',
      })
    assert.strictEqual(response.status, 400)
    assert.match(response.text, /Unknown or invalid redirect_uri/)
  },

  'POST /extension/token rejects code when redirect_uri does not match the bound value': async () => {
    let capturedCode
    const issueCodeFn = (userId, codeChallenge, opts) => {
      capturedCode = `code-${userId}`
      issueCodeFn.lastBound = opts?.boundRedirectUri
      return capturedCode
    }
    const consumeCodeFn = (code, codeVerifier, opts) => {
      if (code !== capturedCode) return null
      if (issueCodeFn.lastBound && issueCodeFn.lastBound !== opts?.redirectUri) return null
      return { userId: 99 }
    }
    const allowedRedirect = `chrome-extension://${ALLOWED_EXTENSION_ID}/auth-callback.html`
    const { app } = buildApp({
      config: {
        ...baseConfig(generatePrivateKey()),
        extensionOauthAllowedRedirectPatterns: [/^chrome-extension:\/\/[a-p]{32}\/auth-callback\.html$/],
      },
      extensionRefreshToken: fakeRefreshTokenStore(),
      tokenServer: fakeTokenServer(),
      issueCodeFn,
      consumeCodeFn,
      session: { userId: 99 },
    })
    await request(app)
      .get('/api/auth/login/extension')
      .query({
        extensionId: ALLOWED_EXTENSION_ID,
        code_challenge: 'cc',
        code_challenge_method: 'S256',
        state: 'st',
        redirect_uri: allowedRedirect,
      })
    await request(app).post('/api/auth/login/extension/confirm')
    assert.strictEqual(issueCodeFn.lastBound, allowedRedirect)

    const tampered = `chrome-extension://${'b'.repeat(32)}/auth-callback.html`
    const response = await request(app)
      .post('/api/auth/extension/token')
      .send({
        code: capturedCode,
        code_verifier: 'verifier',
        extensionId: ALLOWED_EXTENSION_ID,
        redirect_uri: tampered,
      })
    assert.strictEqual(response.status, 401)
  },
})
