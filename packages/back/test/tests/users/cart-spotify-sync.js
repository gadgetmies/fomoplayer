'use strict'
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
const { upsertUserAuthorizationTokens } = require('../../../routes/db')

// Enabling a cart's Spotify sync answers with the new storeDetails entry, so the client can show the playlist
// without reloading the carts. Spotify's create-playlist call is mocked (SPOTIFY_MOCK).

const makeRequest = (baseUrl, rawKey) => async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  return { status: res.status, json: text ? JSON.parse(text) : undefined }
}

test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const { raw, userId } = await createTestApiKey()
    const req = makeRequest(`http://localhost:${port}`, raw)
    await upsertUserAuthorizationTokens(userId, 'Spotify', 'mock-access', 'mock-refresh', 3600, [
      'playlist-modify-private',
    ])
    const created = await req('POST', '/api/me/carts', { name: 'cart spotify sync fixture' })
    expect(created.status).to.equal(200)
    return { server, req, userId, cart: created.json }
  },

  teardown: async ({ server, userId, cart }) => {
    server.kill()
    await pg.queryAsync(sql`DELETE FROM cart__store WHERE cart_id = ${cart.id}`)
    await pg.queryAsync(sql`DELETE FROM cart WHERE cart_id = ${cart.id}`)
    await pg.queryAsync(sql`DELETE FROM user__store_authorization WHERE meta_account_user_id = ${userId}`)
  },

  'enabling sync answers with the storeDetails entry that the cart list then shows': async ({ req, cart }) => {
    const { status, json } = await req('POST', `/api/me/carts/${cart.id}/sync/spotify`, { setSync: true })
    expect(status).to.equal(200)
    expect(json).to.deep.equal({
      id: 'fomoplayerMockPlaylist',
      url: 'https://open.spotify.com/playlist/fomoplayerMockPlaylist',
      storeName: 'Spotify',
      versionId: 'fomoplayerMockSnapshot',
    })
    const list = await req('GET', '/api/me/carts')
    expect(list.json.find(({ id }) => id === cart.id).storeDetails).to.deep.equal([json])
  },

  'disabling sync answers 204 and removes the entry': async ({ req, cart }) => {
    const { status } = await req('POST', `/api/me/carts/${cart.id}/sync/spotify`, { setSync: false })
    expect(status).to.equal(204)
    const list = await req('GET', '/api/me/carts')
    expect(list.json.find(({ id }) => id === cart.id).storeDetails).to.deep.equal([])
  },
})
