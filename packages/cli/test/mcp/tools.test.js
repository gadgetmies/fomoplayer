'use strict'
const path = require('path')
require('dotenv').config({ path: path.resolve(__dirname, '../../../back/.env.test') })
const { expect } = require('chai')
const { test } = require('cascade-test')
const { startServer } = require('../../../back/test/lib/server')
const { createTestApiKey } = require('../../../back/test/lib/api-key')
const { FomoPlayerClient } = require('../../src/client')
const { defineTools } = require('../../mcp/tools')

test({
  setup: async () => {
    const { server, port } = await startServer()
    const apiUrl = `http://localhost:${port}`
    const { raw: apiKey } = await createTestApiKey()
    const client = new FomoPlayerClient({ apiUrl, apiKey })
    const tools = defineTools(client)
    return { server, tools }
  },
  teardown: async ({ server }) => { server.kill() },
  'get_schema returns table definitions': async ({ tools }) => {
    const schema = await tools.find((t) => t.name === 'get_schema').handler({})
    expect(schema).to.have.property('track')
  },
  'execute_query rejects non-SELECT': async ({ tools }) => {
    let thrown = null
    try { await tools.find((t) => t.name === 'execute_query').handler({ sql: 'DELETE FROM track' }) }
    catch (err) { thrown = err }
    expect(thrown).to.be.instanceOf(Error)
    expect(thrown.message).to.include('SELECT')
  },
  'get_tracks returns expected shape': async ({ tools }) => {
    const d = await tools.find((t) => t.name === 'get_tracks').handler({})
    expect(d).to.be.an('object')
  },
  'list_carts returns array': async ({ tools }) => {
    const d = await tools.find((t) => t.name === 'list_carts').handler({})
    expect(d).to.be.an('array')
  },
})
