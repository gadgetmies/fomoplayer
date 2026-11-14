'use strict'
const assert = require('assert')
const { test } = require('cascade-test')
const { initDb } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')

// The player plays uploaded samples as track-like items with ids like "sample-17". Their
// embedding image request must be a plain 404, not an integer cast error from Postgres.
test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const { raw } = await createTestApiKey()
    const get = async (path) => {
      const res = await fetch(`http://localhost:${port}/api${path}`, { headers: { Authorization: `Bearer ${raw}` } })
      return { status: res.status, text: await res.text() }
    }
    return { server, get }
  },
  'a sample id returns 404': async ({ get }) => {
    const { status, text } = await get('/tracks/sample-17/embedding.png')
    assert.strictEqual(status, 404)
    assert.strictEqual(text, 'Not found')
  },
  'a track without an embedding returns 404': async ({ get }) => {
    const { status } = await get('/tracks/2147483000/embedding.png')
    assert.strictEqual(status, 404)
  },
  teardown: async ({ server }) => {
    server.kill()
  },
})
