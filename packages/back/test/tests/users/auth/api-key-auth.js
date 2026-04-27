'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')
const { pg } = require('../../../lib/db')
const { hashApiKey } = require('../../../../db/api-key')

const createLimitedApiKey = async () => {
  const { raw, userId } = await createTestApiKey()
  const hash = hashApiKey(raw)
  await pg.queryAsync(
    `UPDATE api_key SET rate_limit_per_minute = 1 WHERE api_key_hash = $1`,
    [hash],
  )
  return { raw, userId }
}

test({
  setup: async () => {
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const { raw: rawKey } = await createTestApiKey()
    return { server, baseUrl, rawKey }
  },
  teardown: async ({ server }) => {
    server.kill()
  },

  'valid api key returns 200 on GET /api/me/tracks': async ({ baseUrl, rawKey }) => {
    const r = await fetch(`${baseUrl}/api/me/tracks`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    })
    expect(r.status).to.equal(200)
  },

  'missing Authorization returns 401': async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/me/tracks`)
    expect(r.status).to.equal(401)
  },

  'unknown api key returns 401': async ({ baseUrl }) => {
    const r = await fetch(`${baseUrl}/api/me/tracks`, {
      headers: { Authorization: 'Bearer fp_unknown-key-that-does-not-exist' },
    })
    expect(r.status).to.equal(401)
  },

  'rate limit exceeded': {
    setup: async ({ baseUrl }) => {
      const { raw: limitedKey } = await createLimitedApiKey()
      // Consume the one allowed request
      await fetch(`${baseUrl}/api/me/tracks`, {
        headers: { Authorization: `Bearer ${limitedKey}` },
      })
      return { baseUrl, limitedKey }
    },
    'returns 429 with Retry-After header when per-minute limit exceeded': async ({ baseUrl, limitedKey }) => {
      const r = await fetch(`${baseUrl}/api/me/tracks`, {
        headers: { Authorization: `Bearer ${limitedKey}` },
      })
      expect(r.status).to.equal(429)
      expect(r.headers.get('Retry-After')).to.be.a('string')
    },
  },
})
