const assert = require('assert')
const { test } = require('cascade-test')
const express = require('express')
const supertest = require('supertest')

const { createEmailRouter } = require('../../../routes/email/index')
const { generateToken, validateToken } = require('../../../services/email-unsubscribe')

const SECRET = 'endpoint-test-secret'

const buildApp = () => {
  const suppressed = new Set()
  const calls = { suppress: [], unsuppress: [] }
  const app = express()
  app.use(
    '/api/email',
    createEmailRouter({
      validateToken: (token) => validateToken(token, SECRET),
      suppress: async (address, source) => {
        calls.suppress.push({ address, source })
        suppressed.add(address)
      },
      unsuppress: async (address) => {
        calls.unsuppress.push({ address })
        suppressed.delete(address)
      },
    }),
  )
  return { app, suppressed, calls }
}

const address = 'listener@example.com'
const validTok = () => generateToken(address, SECRET)

test({
  'email unsubscribe endpoints': {
    'one-click POST with valid token → 200 empty body and suppresses': async () => {
      const { app, calls, suppressed } = buildApp()
      const res = await supertest(app)
        .post(`/api/email/unsubscribe?token=${encodeURIComponent(validTok())}`)
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('List-Unsubscribe=One-Click')
      assert.equal(res.status, 200)
      assert.equal(res.text, '')
      assert.ok(suppressed.has(address))
      assert.equal(calls.suppress.length, 1)
    },

    'repeat one-click POST stays 200 (idempotent at endpoint)': async () => {
      const { app } = buildApp()
      const one = () =>
        supertest(app)
          .post(`/api/email/unsubscribe?token=${encodeURIComponent(validTok())}`)
          .set('Content-Type', 'application/x-www-form-urlencoded')
          .send('List-Unsubscribe=One-Click')
      assert.equal((await one()).status, 200)
      assert.equal((await one()).status, 200)
    },

    'invalid token → 400 and no suppression': async () => {
      const { app, calls } = buildApp()
      const res = await supertest(app)
        .post('/api/email/unsubscribe?token=not-a-valid-token')
        .set('Content-Type', 'application/x-www-form-urlencoded')
        .send('List-Unsubscribe=One-Click')
      assert.equal(res.status, 400)
      assert.equal(calls.suppress.length, 0)
    },

    'GET renders a branded confirm page and does not mutate': async () => {
      const { app, calls } = buildApp()
      const res = await supertest(app).get(`/api/email/unsubscribe?token=${encodeURIComponent(validTok())}`)
      assert.equal(res.status, 200)
      assert.ok(/Unsubscribe from all emails\?/.test(res.text), 'confirm heading present')
      assert.ok(res.text.includes(address), 'address shown')
      assert.ok(/Fomo Player/.test(res.text), 'branded')
      // Confirm button POSTs to the origin-relative mount path, not a
      // configured absolute host, so it works in every environment.
      assert.ok(res.text.includes('"/api/email"'), 'origin-relative base path used')
      assert.equal(calls.suppress.length, 0, 'GET must not mutate')
    },

    'GET with invalid token → 400 invalid page': async () => {
      const { app } = buildApp()
      const res = await supertest(app).get('/api/email/unsubscribe?token=bad')
      assert.equal(res.status, 400)
      assert.ok(/invalid/i.test(res.text))
    },

    'resubscribe POST removes suppression': async () => {
      const { app, suppressed, calls } = buildApp()
      suppressed.add(address)
      const res = await supertest(app)
        .post(`/api/email/resubscribe?token=${encodeURIComponent(validTok())}`)
        .send()
      assert.equal(res.status, 200)
      assert.ok(!suppressed.has(address))
      assert.equal(calls.unsuppress.length, 1)
    },
  },
})
