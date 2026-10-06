'use strict'
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')

// Paging and the response envelopes of the track lists: the search, the user's track lists and the carts.

const TRACK_COUNT = 5

const bandcampTrack = (index) => ({
  id: String(920000100 + index),
  url: `https://example.bandcamp.com/track/track-list-api-${index}`,
  title: `track list api ${index}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `track list api artist ${index}`,
      role: 'author',
      id: `track-list-api-artist-${index}`,
      url: `https://track-list-api-${index}.bandcamp.com`,
    },
  ],
  release: {
    id: `track-list-api-release-${index}`,
    url: `https://example.bandcamp.com/album/track-list-api-${index}`,
    title: `track list api release ${index}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    {
      format: 'mp3',
      url: `https://example.bandcamp.com/preview/track-list-api-${index}.mp3`,
      start_ms: 0,
      end_ms: 180000,
    },
  ],
})

const makeRequest = (baseUrl, rawKey) => async (method, path, body) => {
  const res = await fetch(`${baseUrl}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rawKey}` },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = undefined
  }
  return { status: res.status, json, text }
}

const addedDates = async (cartId) =>
  Object.fromEntries(
    (await pg.queryRowsAsync(sql`SELECT track_id, track__cart_added FROM track__cart WHERE cart_id = ${cartId}`)).map(
      ({ track_id, track__cart_added }) => [track_id, track__cart_added.toISOString()],
    ),
  )

test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const { raw, userId } = await createTestApiKey()
    const req = makeRequest(`http://localhost:${port}`, raw)

    const seeded = await addBandcampTracks(
      Array.from({ length: TRACK_COUNT }, (_, i) => bandcampTrack(i)),
      [userId],
    )
    const trackIds = []
    for (let i = 0; i < TRACK_COUNT; i++) {
      const [{ track_id }] = await pg.queryRowsAsync(
        sql`SELECT track_id FROM store__track WHERE store__track_store_id = ${String(920000100 + i)}`,
      )
      trackIds.push(track_id)
    }

    const created = await req('POST', '/api/me/carts', { name: 'track list api fixture' })
    expect(created.status).to.equal(200)
    const cart = created.json
    // Distinct added dates, oldest first, so the cart's newest-first order is known.
    for (const [i, trackId] of trackIds.entries()) {
      await pg.queryAsync(sql`
        INSERT INTO track__cart (cart_id, track_id, track__cart_added)
        VALUES (${cart.id}, ${trackId}, NOW() - (${TRACK_COUNT - i} * INTERVAL '1 hour'))`)
    }

    return { server, req, userId, cart, trackIds, addedTracks: seeded.addedTracks, addedSources: [seeded.sourceId] }
  },

  teardown: async (ctx) => {
    ctx.server.kill()
    await pg.queryAsync(sql`DELETE FROM track__cart WHERE cart_id = ${ctx.cart.id}`)
    await pg.queryAsync(sql`DELETE FROM cart WHERE cart_id = ${ctx.cart.id}`)
    await teardownTracks(ctx)
  },

  'rejects a zero, negative, non-numeric or too large limit and a negative offset': async ({ req, cart }) => {
    for (const path of [
      `/api/tracks?q=track&limit=0`,
      `/api/tracks?q=track&limit=501`,
      `/api/tracks?q=track&offset=-1`,
      `/api/me/carts/${cart.id}?limit=0`,
      `/api/me/carts/${cart.id}?limit=abc`,
      `/api/carts/${cart.uuid}?limit=0`,
    ]) {
      const { status } = await req('GET', path)
      expect(status, path).to.equal(400)
    }
  },

  'pages through the cart tracks newest first': async ({ req, cart, trackIds }) => {
    const first = await req('GET', `/api/me/carts/${cart.id}?limit=2`)
    expect(first.status).to.equal(200)
    expect(first.json.tracks.map(({ id }) => id)).to.deep.equal([trackIds[4], trackIds[3]])
    const second = await req('GET', `/api/me/carts/${cart.id}?offset=2&limit=2`)
    expect(second.json.tracks.map(({ id }) => id)).to.deep.equal([trackIds[2], trackIds[1]])
  },

  'GET /me/carts/:id returns the cart, one page of its tracks and the page': async ({ req, cart }) => {
    const { status, json } = await req('GET', `/api/me/carts/${cart.id}?limit=2`)
    expect(status).to.equal(200)
    expect(json).to.have.all.keys('cart', 'tracks', 'page', 'meta')
    expect(json.cart).to.include({
      id: cart.id,
      uuid: cart.uuid,
      name: 'track list api fixture',
      track_count: TRACK_COUNT,
    })
    expect(json.cart).to.not.have.property('tracks')
    expect(json.page).to.deep.equal({ offset: 0, limit: 2, total: TRACK_COUNT })
    expect(json.meta).to.deep.equal({})
  },

  'page.total counts only the tracks matching the filters': async ({ req, cart }) => {
    // The two newest tracks were added less than 2.5 hours ago.
    const since = new Date(Date.now() - 2.5 * 60 * 60 * 1000).toISOString()
    const { json } = await req('GET', `/api/me/carts/${cart.id}?since=${encodeURIComponent(since)}`)
    expect(json.page.total).to.equal(2)
    expect(json.tracks).to.have.length(2)
    expect(json.cart.track_count).to.equal(TRACK_COUNT)
  },

  'GET /carts/:uuid answers 404 for an unknown cart': async ({ req }) => {
    for (const uuid of ['00000000-0000-4000-8000-000000000000', 'not-a-uuid']) {
      const { status } = await req('GET', `/api/carts/${uuid}`)
      expect(status, uuid).to.equal(404)
    }
  },

  'cart request bodies are camelCase': async ({ req, trackIds }) => {
    const created = await req('POST', '/api/me/carts', {
      name: 'track list api camelCase',
      tracks: trackIds.slice(0, 2).map((trackId) => ({ trackId })),
    })
    expect(created.status).to.equal(200)
    try {
      const updated = await req('POST', `/api/me/carts/${created.json.id}`, { isPublic: true })
      expect(updated.status).to.equal(204)
      const { json } = await req('GET', `/api/me/carts/${created.json.id}`)
      expect(json.cart.is_public).to.equal(true)
      expect(json.tracks.map(({ id }) => id)).to.have.members(trackIds.slice(0, 2))
    } finally {
      await pg.queryAsync(sql`DELETE FROM track__cart WHERE cart_id = ${created.json.id}`)
      await pg.queryAsync(sql`DELETE FROM cart WHERE cart_id = ${created.json.id}`)
    }
  },

  'PATCH /me/carts/:id/tracks answers with the cart envelope': async ({ req, cart, trackIds }) => {
    const { status, json } = await req('PATCH', `/api/me/carts/${cart.id}/tracks`, [
      { op: 'add', trackId: trackIds[0] },
    ])
    expect(status).to.equal(200)
    expect(json).to.have.all.keys('cart', 'tracks', 'page', 'meta')
  },

  'PUT /me/carts/:id/tracks makes the cart contain exactly the given tracks': async ({ req, cart, trackIds }) => {
    const before = await addedDates(cart.id)
    const wanted = [trackIds[0], trackIds[1], trackIds[2]]
    const { status, json } = await req('PUT', `/api/me/carts/${cart.id}/tracks`, wanted)
    expect(status).to.equal(200)
    expect(json).to.deep.equal({ added: 0, removed: 2 })
    const after = await addedDates(cart.id)
    expect(Object.keys(after).map(Number)).to.have.members(wanted)
    for (const id of wanted) expect(after[id], 'kept tracks keep their added date').to.equal(before[id])

    const readded = await req('PUT', `/api/me/carts/${cart.id}/tracks`, trackIds)
    expect(readded.json).to.deep.equal({ added: 2, removed: 0 })
  },

  'GET /me/tracks returns the first page of each list and the user totals': async ({ req, userId, trackIds }) => {
    const { status, json } = await req('GET', '/api/me/tracks?limit=2')
    expect(status).to.equal(200)
    expect(json.lists).to.have.all.keys('new', 'heard', 'recentlyAdded')
    for (const list of Object.values(json.lists)) {
      expect(list).to.have.all.keys('tracks', 'page')
      expect(list.page).to.include({ offset: 0, limit: 2 })
      expect(list.tracks.length).to.be.at.most(2)
    }
    expect(json.lists.new.page.total).to.equal(TRACK_COUNT)
    expect(json.lists.recentlyAdded.page.total).to.equal(TRACK_COUNT)
    expect(json.meta).to.have.all.keys('totalTracks', 'notHeardBefore')
    // Every one of the user's tracks, purchased ones included, each counted once.
    const [{ count }] = await pg.queryRowsAsync(
      sql`SELECT COUNT(DISTINCT track_id)::INT AS count FROM user__track WHERE meta_account_user_id = ${userId}`,
    )
    expect(json.meta.totalTracks).to.equal(count)
    expect(count).to.be.at.least(trackIds.length)
  },

  'GET /me/tracks/:list pages through one list': async ({ req }) => {
    const first = await req('GET', '/api/me/tracks/recentlyAdded?limit=2')
    expect(first.status).to.equal(200)
    expect(first.json).to.have.all.keys('tracks', 'page', 'meta')
    expect(first.json.page).to.deep.equal({ offset: 0, limit: 2, total: TRACK_COUNT })
    const { notHeardBefore } = first.json.meta
    const rest = await req(
      'GET',
      `/api/me/tracks/recentlyAdded?offset=2&limit=10&notHeardBefore=${encodeURIComponent(notHeardBefore)}`,
    )
    expect(rest.json.page).to.deep.equal({ offset: 2, limit: 10, total: TRACK_COUNT })
    const ids = [...first.json.tracks, ...rest.json.tracks].map(({ id }) => id)
    expect(new Set(ids).size).to.equal(TRACK_COUNT)
  },

  'GET /me/tracks rejects invalid paging and dates': async ({ req }) => {
    for (const path of [
      '/api/me/tracks?limit=0',
      '/api/me/tracks/new?limit=0',
      '/api/me/tracks/heard?offset=-1',
      '/api/me/tracks/new?notHeardBefore=yesterday',
    ]) {
      const { status } = await req('GET', path)
      expect(status, path).to.equal(400)
    }
  },

  'PUT /me/carts/:id/tracks rejects a body that is not a list of ids': async ({ req, cart }) => {
    const { status } = await req('PUT', `/api/me/carts/${cart.id}/tracks`, { trackIds: [1] })
    expect(status).to.equal(400)
  },
})
