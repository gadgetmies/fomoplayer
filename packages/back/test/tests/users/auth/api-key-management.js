'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../../lib/server')
const { createTestApiKey } = require('../../../lib/api-key')
const { createApiKey } = require('../../../../db/api-key')
const { resolveTestUserId } = require('../../../lib/test-user')

test({
  setup: async () => {
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const { raw: rawKey } = await createTestApiKey()
    return { server, baseUrl, rawKey }
  },
  teardown: async ({ server }) => { server.kill() },
  'GET /api/me/api-keys returns array with prefix': async ({ baseUrl, rawKey }) => {
    const r = await fetch(`${baseUrl}/api/me/api-keys`, {
      headers: { Authorization: `Bearer ${rawKey}` },
    })
    expect(r.status).to.equal(200)
    const keys = await r.json()
    expect(keys).to.be.an('array').with.length.above(0)
    expect(keys[0]).to.have.property('api_key_prefix')
  },
  'DELETE /api/me/api-keys/:id revokes key': {
    setup: async (parentCtx) => {
      const userId = await resolveTestUserId()
      const { randomUUID } = require('crypto')
      const raw2 = `fp_${randomUUID()}`
      const record = await createApiKey(userId, raw2, 'to-revoke')
      return { ...parentCtx, raw2, record }
    },
    'revoke returns 204': async ({ baseUrl, rawKey, record }) => {
      const r = await fetch(`${baseUrl}/api/me/api-keys/${record.api_key_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${rawKey}` },
      })
      expect(r.status).to.equal(204)
    },
    'revoked key returns 401': async ({ baseUrl, rawKey, record, raw2 }) => {
      await fetch(`${baseUrl}/api/me/api-keys/${record.api_key_id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${rawKey}` },
      })
      const r = await fetch(`${baseUrl}/api/me/tracks`, {
        headers: { Authorization: `Bearer ${raw2}` },
      })
      expect(r.status).to.equal(401)
    },
  },
})
