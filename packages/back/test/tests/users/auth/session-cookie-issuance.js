const assert = require('assert')
const express = require('express')
const request = require('supertest')
const session = require('express-session')
const { test } = require('cascade-test')

const createApp = () => {
  const app = express()
  app.use(
    session({
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: { maxAge: 30 * 24 * 60 * 60 * 1000 },
    }),
  )

  app.get('/static/test.woff2', (_, res) => {
    res.type('font/woff2').send('woff2-bytes')
  })

  app.get('/auth/mutate', (req, res) => {
    req.session.oidcHandoff = { nonce: 'nonce-1' }
    res.status(204).end()
  })

  return app
}

const hasSessionCookie = (headers = []) => headers.some((header) => header.startsWith('connect.sid='))

test({
  'static response does not set session cookie before auth mutation': async () => {
    const app = createApp()

    const response = await request(app).get('/static/test.woff2')

    assert.strictEqual(response.status, 200)
    assert.strictEqual(hasSessionCookie(response.headers['set-cookie']), false)
  },

  'auth mutation sets session cookie but subsequent static response does not rotate it': async () => {
    const app = createApp()
    const agent = request.agent(app)

    const authResponse = await agent.get('/auth/mutate')
    assert.strictEqual(authResponse.status, 204)
    assert.strictEqual(hasSessionCookie(authResponse.headers['set-cookie']), true)

    const staticResponse = await agent.get('/static/test.woff2')
    assert.strictEqual(staticResponse.status, 200)
    assert.strictEqual(hasSessionCookie(staticResponse.headers['set-cookie']), false)
  },
})

