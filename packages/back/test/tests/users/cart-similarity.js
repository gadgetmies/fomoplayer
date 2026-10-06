'use strict'
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')
const { setTrackHeard } = require('../../../routes/users/db')

const DIM = 1280
const MODEL = 'discogs_multi_embeddings-effnet-bs64-1'

// Embedding near one of a few orthogonal "style" directions, with a small per-track offset.
const styleVector = (style, jitter) =>
  Array.from({ length: DIM }, (_, i) => (i === style * 10 ? 1 : 0) + Math.sin((i + 1) * (jitter + 1) * 0.37) * 0.04)

// Cart: three tracks of style A and three of style B. Catalogue: tracks near A and B, plus tracks that must be
// excluded (heard, ignored artist, purchased) even though they are the closest matches.
const FIXTURES = [
  { key: 'cartA1', style: 0, inCart: true },
  { key: 'cartA2', style: 0, inCart: true },
  { key: 'cartA3', style: 0, inCart: true },
  { key: 'cartB1', style: 1, inCart: true },
  { key: 'cartB2', style: 1, inCart: true },
  { key: 'cartB3', style: 1, inCart: true },
  { key: 'nearA1', style: 0 },
  { key: 'nearA2', style: 0 },
  { key: 'nearB1', style: 1 },
  { key: 'nearB2', style: 1 },
  { key: 'heardA', style: 0 },
  { key: 'ignoredA', style: 0 },
  { key: 'purchasedB', style: 1 },
  { key: 'farC', style: 2 },
]

const bandcampTrack = (key, index) => ({
  id: String(910000100 + index),
  url: `https://example.bandcamp.com/track/cart-similarity-${key}`,
  title: `cart similarity ${key}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `cart similarity artist ${key}`,
      role: 'author',
      id: `cart-similarity-artist-${key}`,
      url: `https://cart-similarity-${key}.bandcamp.com`,
    },
  ],
  release: {
    id: `cart-similarity-release-${key}`,
    url: `https://example.bandcamp.com/album/cart-similarity-${key}`,
    title: `cart similarity release ${key}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    {
      format: 'mp3',
      url: `https://example.bandcamp.com/preview/cart-similarity-${key}.mp3`,
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

// Cart search through the track search route: { tracks, page, meta }, where meta.cartSearch holds the groups, the map
// and the excluded counts.
const cartSearch = async (req, cartUuid, { terms = '', ...params } = {}) => {
  const query = new URLSearchParams({ q: `cart:~${cartUuid}${terms ? ` ${terms}` : ''}`, ...params })
  const { status, json } = await req('GET', `/api/tracks?${query}`)
  return { status, json: json && { ...json.meta.cartSearch, tracks: json.tracks }, meta: json?.meta, page: json?.page }
}

const titlesOf = (tracks) => tracks.map(({ title }) => title.replace('cart similarity ', ''))

test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const { raw, userId } = await createTestApiKey()
    const req = makeRequest(`http://localhost:${port}`, raw)

    const seeded = await addBandcampTracks(
      FIXTURES.map(({ key }, i) => bandcampTrack(key, i)),
      [userId],
    )
    const trackIdByKey = {}
    for (const [i, { key }] of FIXTURES.entries()) {
      const [{ track_id }] = await pg.queryRowsAsync(
        sql`SELECT track_id FROM store__track WHERE store__track_store_id = ${String(910000100 + i)}`,
      )
      trackIdByKey[key] = track_id
    }

    for (const [i, { key, style }] of FIXTURES.entries()) {
      const previews = await pg.queryRowsAsync(
        sql`SELECT store__track_preview_id FROM store__track_preview NATURAL JOIN store__track WHERE track_id = ${trackIdByKey[key]}`,
      )
      for (const { store__track_preview_id } of previews) {
        await pg.queryAsync(sql`
          INSERT INTO store__track_preview_embedding (store__track_preview_id, store__track_preview_embedding_type, store__track_preview_embedding)
          VALUES (${store__track_preview_id}, ${MODEL}, ${`[${styleVector(style, i).join(',')}]`}::VECTOR)
          ON CONFLICT DO NOTHING`)
      }
    }

    const created = await req('POST', '/api/me/carts', { name: 'cart similarity fixture' })
    expect(created.status).to.equal(200)
    const cart = created.json
    const patched = await req(
      'PATCH',
      `/api/me/carts/${cart.id}/tracks`,
      FIXTURES.filter((f) => f.inCart).map(({ key }) => ({ op: 'add', trackId: trackIdByKey[key] })),
    )
    expect(patched.status).to.equal(200)

    await setTrackHeard(trackIdByKey.heardA, userId, true)
    const [{ artist_id: ignoredArtistId }] = await pg.queryRowsAsync(
      sql`SELECT artist_id FROM track__artist WHERE track_id = ${trackIdByKey.ignoredA}`,
    )
    await pg.queryAsync(
      sql`INSERT INTO user__artist_ignore (artist_id, meta_account_user_id) VALUES (${ignoredArtistId}, ${userId})`,
    )
    const [{ cart_id: purchasedCartId }] = await pg.queryRowsAsync(
      sql`SELECT cart_id FROM cart WHERE meta_account_user_id = ${userId} AND cart_is_purchased`,
    )
    await pg.queryAsync(
      sql`INSERT INTO track__cart (cart_id, track_id) VALUES (${purchasedCartId}, ${trackIdByKey.purchasedB})`,
    )

    const [{ cart_uuid: cartUuid }] = await pg.queryRowsAsync(
      sql`SELECT cart_uuid FROM cart WHERE cart_id = ${cart.id}`,
    )
    return {
      server,
      req,
      userId,
      cartId: cart.id,
      cartUuid,
      trackIdByKey,
      ignoredArtistId,
      purchasedCartId,
      addedTracks: seeded.addedTracks,
      addedSources: [seeded.sourceId],
    }
  },

  teardown: async (ctx) => {
    ctx.server.kill()
    await pg.queryAsync(sql`DELETE FROM user__artist_ignore WHERE artist_id = ${ctx.ignoredArtistId}`)
    await pg.queryAsync(
      sql`DELETE FROM track__cart WHERE cart_id = ${ctx.purchasedCartId} AND track_id = ${ctx.trackIdByKey.purchasedB}`,
    )
    await pg.queryAsync(sql`DELETE FROM track__cart WHERE cart_id = ${ctx.cartId}`)
    await pg.queryAsync(sql`DELETE FROM cart WHERE cart_id = ${ctx.cartId}`)
    await pg.queryAsync(sql`
      DELETE FROM store__track_preview_embedding
      WHERE store__track_preview_id IN (SELECT store__track_preview_id
                                        FROM store__track_preview NATURAL JOIN store__track
                                        WHERE track_id = ANY (${Object.values(ctx.trackIdByKey)}::INT[]))`)
    await teardownTracks(ctx)
  },

  'groups the cart into its two styles automatically': async ({ req, cartUuid, trackIdByKey }) => {
    const { status, json } = await cartSearch(req, cartUuid)
    expect(status).to.equal(200)
    expect(json.autoK).to.equal(2)
    expect(json.k).to.equal(2)
    expect(json.maxK).to.equal(2)
    const groupsAsSets = json.groups.map((g) =>
      json.map.members
        .filter((m) => m.group === g.index)
        .map(({ trackId }) => trackId)
        .sort(),
    )
    expect(groupsAsSets).to.have.deep.members([
      [trackIdByKey.cartA1, trackIdByKey.cartA2, trackIdByKey.cartA3].sort(),
      [trackIdByKey.cartB1, trackIdByKey.cartB2, trackIdByKey.cartB3].sort(),
    ])
    expect(json.map.members).to.have.length(6)
  },

  'returns similar tracks per group with Fit and leaves known tracks out': async ({ req, cartUuid }) => {
    const { json } = await cartSearch(req, cartUuid)
    const titles = titlesOf(json.tracks)
    expect(titles).to.include.members(['nearA1', 'nearA2', 'nearB1', 'nearB2'])
    expect(titles).to.not.include.members(['heardA'])
    expect(titles).to.not.include('ignoredA')
    expect(titles).to.not.include('purchasedB')
    expect(titles.filter((t) => t.startsWith('cart'))).to.have.length(0)
    expect(json.excluded.heard).to.be.at.least(1)
    expect(json.excluded.ignored).to.be.at.least(1)
    expect(json.excluded.purchased).to.be.at.least(1)
    for (const track of json.tracks) {
      expect(track.cartSearch.fit).to.be.within(0, 100)
      expect(track.cartSearch.group).to.be.oneOf([0, 1])
      expect(track.cartSearch.x).to.be.within(0, 1)
      expect(track.cartSearch.y).to.be.within(0, 1)
    }
    const fits = json.tracks.map((t) => t.cartSearch.fit)
    expect(fits).to.deep.equal([...fits].sort((a, b) => b - a))
    const nearA = json.tracks.find((t) => t.title.endsWith('nearA1'))
    const nearB = json.tracks.find((t) => t.title.endsWith('nearB1'))
    expect(nearA.cartSearch.group).to.not.equal(nearB.cartSearch.group)
  },

  'clamps the group count and accepts one group': async ({ req, cartUuid }) => {
    const many = await cartSearch(req, cartUuid, { k: 50 })
    expect(many.json.k).to.equal(2)
    const one = await cartSearch(req, cartUuid, { k: 1 })
    expect(one.json.k).to.equal(1)
    expect(one.json.groups).to.have.length(1)
    expect(one.json.groups[0].size).to.equal(6)
  },

  'pushes the search away from session misses without storing them': async ({ req, cartUuid, trackIdByKey }) => {
    const before = await cartSearch(req, cartUuid)
    const missId = trackIdByKey.nearA1
    const after = await cartSearch(req, cartUuid, { misses: missId })
    expect(after.json.tracks.map((t) => t.id)).to.not.include(missId)
    const pushedGroup = after.json.groups.find((g) => g.pushedAwayFrom === 1)
    expect(pushedGroup).to.exist
    const fitOf = (res, key) => res.json.tracks.find((t) => t.title.endsWith(key))?.cartSearch.fit
    expect(fitOf(after, 'nearA2')).to.be.at.most(fitOf(before, 'nearA2'))
  },

  'hides followed or purchased artists with newArtistsOnly': async ({ req, cartUuid }) => {
    const { json } = await cartSearch(req, cartUuid, { newArtistsOnly: 'true' })
    expect(json.excluded.knownArtists).to.be.a('number')
    expect(json.tracks.length).to.be.at.most((await cartSearch(req, cartUuid)).json.tracks.length)
  },

  'reports the cart tracks the groups are formed from': async ({ req, cartUuid }) => {
    const { json } = await cartSearch(req, cartUuid)
    expect(json.cartTracks).to.deep.equal({ total: 6, analysed: 6, used: 6, limit: 300 })
  },

  'filters the results with free text': async ({ req, cartUuid }) => {
    const { json } = await cartSearch(req, cartUuid, { terms: 'nearA1' })
    expect(titlesOf(json.tracks)).to.deep.equal(['nearA1'])
    expect(json.groups).to.have.length(2)
  },

  'filters the results by artist': async ({ req, cartUuid, trackIdByKey }) => {
    const [{ artist_id }] = await pg.queryRowsAsync(
      sql`SELECT artist_id FROM track__artist WHERE track_id = ${trackIdByKey.nearB2}`,
    )
    const { json } = await cartSearch(req, cartUuid, { terms: `artist:${artist_id}` })
    expect(titlesOf(json.tracks)).to.deep.equal(['nearB2'])
  },

  'returns no tracks for a cart that is not the user’s': async ({ req }) => {
    const res = await cartSearch(req, '00000000-0000-4000-8000-000000000000')
    expect(res.status).to.equal(200)
    expect(res.json.tracks).to.deep.equal([])
    expect(res.meta.cartSearch).to.equal(null)
  },

  'returns every cart search result on one page': async ({ req, cartUuid }) => {
    const { json, page, meta } = await cartSearch(req, cartUuid)
    expect(page).to.deep.equal({ offset: 0, limit: 2 * 50, total: json.tracks.length })
    expect(meta.cartSearch.limitPerGroup).to.equal(50)
  },

  'reports the offset, limit and total of a normal search in page': async ({ req }) => {
    const all = await req('GET', `/api/tracks?q=${encodeURIComponent('cart similarity')}&limit=100`)
    expect(all.status).to.equal(200)
    const { total } = all.json.page
    expect(total).to.be.at.least(FIXTURES.length)
    expect(all.json.page).to.deep.equal({ offset: 0, limit: 100, total })
    expect(all.json.meta).to.deep.equal({})

    const page = await req('GET', `/api/tracks?q=${encodeURIComponent('cart similarity')}&limit=5&offset=2`)
    expect(page.json.page).to.deep.equal({ offset: 2, limit: 5, total })
    expect(page.json.tracks.map((t) => t.id)).to.deep.equal(all.json.tracks.slice(2, 7).map((t) => t.id))
  },
})
