'use strict'
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
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
    await initDb()
    const { server, port } = await startServer()
    const { raw: rawKey, userId } = await createTestApiKey()
    const [{ release_id: releaseId }] = await pg.queryRowsAsync(
      sql`INSERT INTO release (release_name) VALUES ('ignore fixture release') RETURNING release_id`,
    )
    const [{ artist_id: artistId }] = await pg.queryRowsAsync(
      sql`INSERT INTO artist (artist_name) VALUES ('ignore fixture artist') RETURNING artist_id`,
    )
    return { server, req: makeRequest(`http://localhost:${port}`, rawKey), userId, releaseId, artistId }
  },
  teardown: async ({ server, userId, releaseId, artistId }) => {
    server.kill()
    await pg.queryAsync(sql`DELETE FROM user__release_ignore WHERE meta_account_user_id = ${userId}`)
    await pg.queryAsync(sql`DELETE FROM user__artist_ignore WHERE meta_account_user_id = ${userId}`)
    await pg.queryAsync(sql`DELETE FROM release WHERE release_id = ${releaseId}`)
    await pg.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${artistId}`)
  },
  'POST /api/me/ignores/releases': {
    'returns 400 for a non-array body': async ({ req }) => {
      const r = await req('POST', '/api/me/ignores/releases', { id: '1' })
      expect(r.status).to.equal(400)
    },
    'stores the ignore before responding': async ({ req, userId, releaseId }) => {
      const r = await req('POST', '/api/me/ignores/releases', [String(releaseId)])
      expect(r.status).to.equal(204)
      const rows = await pg.queryRowsAsync(
        sql`SELECT 1 FROM user__release_ignore WHERE meta_account_user_id = ${userId} AND release_id = ${releaseId}`,
      )
      expect(rows).to.have.length(1)
    },
    'returns 500 instead of an unhandled rejection when the insert fails': async ({ req }) => {
      const r = await req('POST', '/api/me/ignores/releases', ['2147483647'])
      expect(r.status).to.equal(500)
    },
  },
  'POST /api/me/ignores/artists stores the ignore before responding': async ({ req, userId, artistId }) => {
    const r = await req('POST', '/api/me/ignores/artists', [artistId])
    expect(r.status).to.equal(204)
    const rows = await pg.queryRowsAsync(
      sql`SELECT 1 FROM user__artist_ignore WHERE meta_account_user_id = ${userId} AND artist_id = ${artistId}`,
    )
    expect(rows).to.have.length(1)
  },
})
