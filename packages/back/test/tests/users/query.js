'use strict'
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')

test({
  setup: async () => {
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const { raw: rawKey } = await createTestApiKey()
    const query = (sql) => fetch(`${baseUrl}/api/me/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({ sql }),
    })
    return { server, baseUrl, rawKey, query }
  },
  teardown: async ({ server }) => { server.kill() },
  'accepts SELECT': async ({ query }) => {
    const r = await query('SELECT 1 AS n')
    expect(r.status).to.equal(200)
    const body = await r.json()
    expect(body.rows).to.deep.equal([{ n: 1 }])
  },
  'rejects non-SELECT statements': {
    setup: async (parentCtx) => ({ ...parentCtx }),
    ...Object.fromEntries(
      ['INSERT INTO track VALUES (1)', 'UPDATE track SET track_id=1', 'DROP TABLE track'].map((stmt) => [
        `rejects: ${stmt.slice(0, 20)}`,
        async ({ query }) => {
          expect((await query(stmt)).status).to.equal(400)
        },
      ])
    ),
  },
  'returns 400 when sql missing': async ({ baseUrl, rawKey }) => {
    const r = await fetch(`${baseUrl}/api/me/query`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
      body: JSON.stringify({}),
    })
    expect(r.status).to.equal(400)
  },
  'caps at 500 rows': async ({ query }) => {
    const r = await query('SELECT generate_series(1,600) AS n')
    const body = await r.json()
    expect(body.rows).to.have.length(500)
    expect(body.truncated).to.equal(true)
  },
  'times out slow queries': async ({ query }) => {
    const r = await query('SELECT pg_sleep(10)')
    expect(r.status).to.equal(408)
  },
})
