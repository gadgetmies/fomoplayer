'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { mintHandoffToken } = require('../../../../routes/shared/auth-handoff-token')
const account = require('../../../../db/account')
const { pg } = require('../../../lib/db')

const HANDOFF_SECRET = process.env.OIDC_HANDOFF_SECRET
const API_ORIGIN = 'http://localhost'
const OIDC_ISSUER = 'accounts.google.com'
const OIDC_SUBJECT = 'test-subject-cli-exchange'

const mintToken = () =>
  mintHandoffToken({
    secret: HANDOFF_SECRET,
    issuer: API_ORIGIN,
    audience: API_ORIGIN,
    oidcIssuer: OIDC_ISSUER,
    oidcSubject: OIDC_SUBJECT,
  })

test({
  setup: async () => {
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const user = await account.findOrCreateByIdentifier(OIDC_ISSUER, OIDC_SUBJECT)
    return { server, baseUrl, userId: user.id }
  },
  teardown: async ({ server, userId }) => {
    server.kill()
    await pg.queryAsync('DELETE FROM api_key WHERE meta_account_user_id = $1', [userId])
  },

  'returns 400 when token is missing': async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    })
    expect(r.status).to.equal(400)
    const body = await r.json()
    expect(body.error).to.equal('token is required')
  },

  'returns 401 for invalid token': async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'not-a-valid-token' }),
    })
    expect(r.status).to.equal(401)
  },

  'returns api key for valid token': async ({ baseUrl }) => {
    const { token } = mintToken()
    const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    expect(r.status).to.equal(200)
    const body = await r.json()
    expect(body.key).to.be.a('string')
    expect(body.key).to.match(/^fp_/)
    expect(body.id).to.be.a('number')
    expect(body.name).to.equal('fomoplayer CLI')
  },

  'accepts custom name': async ({ baseUrl }) => {
    const { token } = mintToken()
    const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, name: 'My Custom CLI' }),
    })
    expect(r.status).to.equal(200)
    const body = await r.json()
    expect(body.name).to.equal('My Custom CLI')
  },

  'rejects replayed token': {
    setup: async ({ baseUrl }) => {
      const { token } = mintToken()
      // Consume the token once
      await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      return { baseUrl, token }
    },
    'returns 401 on second use': async ({ baseUrl, token }) => {
      const r = await fetch(`${baseUrl}/api/auth/api-keys/exchange-handoff`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      })
      expect(r.status).to.equal(401)
      const body = await r.json()
      expect(body.error).to.equal('Token already used')
    },
  },
})
