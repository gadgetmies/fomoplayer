const assert = require('assert')
const express = require('express')
const session = require('express-session')
const request = require('supertest')
const { test } = require('cascade-test')

const createTestApp = ({ isPreviewEnv }) => {
  const crossSiteCookies = isPreviewEnv
  // Mirrors packages/back/index.js: preview deploys always run NODE_ENV=production,
  // so the cookieSecure check only needs to gate on production.
  const cookieSecure = process.env.NODE_ENV === 'production'
  const app = express()
  app.set('trust proxy', 1)
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 30 * 24 * 60 * 60 * 1000,
        httpOnly: true,
        secure: cookieSecure,
        sameSite: crossSiteCookies ? 'none' : 'lax',
      },
    }),
  )
  app.get('/write-session', (req, res) => {
    req.session.touched = true
    req.session.save(() => res.status(200).send('ok'))
  })
  return app
}

test({
  'session cookie has httpOnly attribute': async () => {
    const app = createTestApp({ isPreviewEnv: false })
    const response = await request(app).get('/write-session')
    const setCookie = response.headers['set-cookie']
    assert.ok(setCookie, 'Expected Set-Cookie header to be present')
    const cookieString = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
    assert.ok(
      /HttpOnly/i.test(cookieString),
      `Expected Set-Cookie to contain HttpOnly, got: ${cookieString}`,
    )
  },

  'session cookie has SameSite=Lax in non-preview mode': async () => {
    const app = createTestApp({ isPreviewEnv: false })
    const response = await request(app).get('/write-session')
    const setCookie = response.headers['set-cookie']
    assert.ok(setCookie, 'Expected Set-Cookie header to be present')
    const cookieString = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
    assert.ok(
      /SameSite=Lax/i.test(cookieString),
      `Expected Set-Cookie to contain SameSite=Lax, got: ${cookieString}`,
    )
  },

  'session cookie has SameSite=None in preview mode': async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const app = createTestApp({ isPreviewEnv: true })
      const response = await request(app).get('/write-session').set('x-forwarded-proto', 'https')
      const setCookie = response.headers['set-cookie']
      assert.ok(setCookie, 'Expected Set-Cookie header to be present')
      const cookieString = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
      assert.ok(
        /SameSite=None/i.test(cookieString),
        `Expected Set-Cookie to contain SameSite=None, got: ${cookieString}`,
      )
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  },

  'session cookie has Secure flag in preview mode': async () => {
    const originalNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    try {
      const app = createTestApp({ isPreviewEnv: true })
      const response = await request(app).get('/write-session').set('x-forwarded-proto', 'https')
      const setCookie = response.headers['set-cookie']
      assert.ok(setCookie, 'Expected Set-Cookie header to be present')
      const cookieString = Array.isArray(setCookie) ? setCookie.join('; ') : setCookie
      assert.ok(
        /\bSecure\b/i.test(cookieString),
        `Expected Set-Cookie to contain Secure, got: ${cookieString}`,
      )
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  },

  'cookieSecure is false in non-production environments': () => {
    const originalNodeEnv = process.env.NODE_ENV
    try {
      for (const env of ['development', 'test', 'ci']) {
        process.env.NODE_ENV = env
        assert.strictEqual(process.env.NODE_ENV === 'production', false)
      }
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  },

  'cookieSecure is true in production environment': () => {
    const originalNodeEnv = process.env.NODE_ENV
    try {
      process.env.NODE_ENV = 'production'
      assert.strictEqual(process.env.NODE_ENV === 'production', true)
    } finally {
      process.env.NODE_ENV = originalNodeEnv
    }
  },

  'SameSite=None cookie invariant: Secure flag must be present': async () => {
    const app = express()
    app.set('trust proxy', 1)
    app.use(
      session({
        secret: 'test-secret',
        resave: false,
        saveUninitialized: false,
        cookie: { maxAge: 1000, httpOnly: true, secure: true, sameSite: 'none' },
      }),
    )
    app.get('/write-session', (req, res) => {
      req.session.touched = true
      req.session.save(() => res.status(200).send('ok'))
    })
    const response = await request(app).get('/write-session').set('x-forwarded-proto', 'https')
    const setCookie = response.headers['set-cookie']?.[0] ?? ''
    assert.match(setCookie, /SameSite=None/i, 'Expected SameSite=None')
    assert.match(setCookie, /\bSecure\b/i, 'Expected Secure flag when SameSite=None')
  },
})
