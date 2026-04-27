'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')

const makeRequest = (baseUrl, rawKey) => (method, path, body) =>
  fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: body ? JSON.stringify(body) : undefined,
  })

test({
  setup: async () => {
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const { raw: rawKey } = await createTestApiKey()
    const req = makeRequest(baseUrl, rawKey)
    return { server, baseUrl, rawKey, req }
  },
  teardown: async ({ server }) => { server.kill() },
  'PATCH /api/me/tracks/ returns heardAt and count': async ({ req }) => {
    const r = await req('PATCH', '/api/me/tracks/', { heard: true })
    expect(r.status).to.equal(200)
    const body = await r.json()
    expect(body).to.have.property('heardAt')
    expect(body).to.have.property('count')
  },
  'DELETE /api/me/tracks/heard': {
    'returns 400 when since is missing': async ({ req }) => {
      const r = await req('DELETE', '/api/me/tracks/heard')
      expect(r.status).to.equal(400)
    },
    'returns 400 for invalid timestamp': async ({ req }) => {
      const r = await req('DELETE', '/api/me/tracks/heard?since=not-a-date')
      expect(r.status).to.equal(400)
    },
    'returns 204 on success': async ({ req }) => {
      const since = new Date().toISOString()
      const r = await req('DELETE', `/api/me/tracks/heard?since=${encodeURIComponent(since)}`)
      expect(r.status).to.equal(204)
    },
  },
})
