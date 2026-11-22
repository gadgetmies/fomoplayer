'use strict'
// GET /api/embeddings/versions and POST /api/embeddings/similar-tracks: clients that hold their own track embeddings
// (Harmonia) list the indexed specification versions and rank previews by their own vectors.
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')
const { setTrackHeard } = require('../../../routes/users/db')
const { hashApiKey } = require('../../../db/api-key')

const DIM = 1280
const TYPE = 'discogs_multi_embeddings-effnet-bs64-1'
const VERSION = 'track-embedding/1'

// Two "styles": unit directions far from the ones other suites seed, each track a little off its style.
const STYLE_AXIS = [1100, 1150]
const unit = (axis) => Array.from({ length: DIM }, (_, i) => (i === axis ? 1 : 0))
const trackVector = (style, offset) =>
  Array.from({ length: DIM }, (_, i) => (i === STYLE_AXIS[style] ? 1 : 0) + (i === 1200 + offset ? 0.05 * offset : 0))
const cosineDistance = (a, b) => {
  const dot = a.reduce((sum, x, i) => sum + x * b[i], 0)
  const norm = (v) => Math.sqrt(v.reduce((sum, x) => sum + x * x, 0))
  return 1 - dot / (norm(a) * norm(b))
}

// nearA1 is closer to style A than nearA2; heard / ignored / purchased tracks are the closest of their style and must
// not be returned.
const FIXTURES = [
  { key: 'nearA1', style: 0, offset: 1 },
  { key: 'nearA2', style: 0, offset: 3 },
  { key: 'nearB1', style: 1, offset: 2 },
  { key: 'heardA', style: 0, offset: 0 },
  { key: 'ignoredA', style: 0, offset: 0 },
  { key: 'purchasedB', style: 1, offset: 0 },
]
const QUERIES = [unit(STYLE_AXIS[0]), unit(STYLE_AXIS[1])]

const bandcampTrack = (key, index) => ({
  id: String(910000300 + index),
  url: `https://example.bandcamp.com/track/embedding-search-${key}`,
  title: `embedding search ${key}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `embedding search artist ${key}`,
      role: 'author',
      id: `embedding-search-artist-${key}`,
      url: `https://embedding-search-${key}.bandcamp.com`,
    },
  ],
  release: {
    id: `embedding-search-release-${key}`,
    url: `https://example.bandcamp.com/album/embedding-search-${key}`,
    title: `embedding search release ${key}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    {
      format: 'mp3',
      url: `https://example.bandcamp.com/preview/embedding-search-${key}.mp3`,
      start_ms: 0,
      end_ms: 180000,
    },
  ],
})

const request =
  (baseUrl) =>
  async (method, path, { body, rawKey, authorization } = {}) => {
    const headers = { 'Content-Type': 'application/json' }
    if (authorization !== undefined) headers.Authorization = authorization
    else if (rawKey) headers.Authorization = `Bearer ${rawKey}`
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined })
    const text = await res.text()
    let json
    try {
      json = JSON.parse(text)
    } catch {
      json = undefined
    }
    return { status: res.status, json, text }
  }

const search = (req, rawKey, body) =>
  req('POST', '/api/embeddings/similar-tracks', {
    rawKey,
    body: { version: VERSION, coverage: 'full', vectors: QUERIES, ...body },
  })

test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const baseUrl = `http://localhost:${port}`
    const { raw: rawKey, userId } = await createTestApiKey()
    const req = request(baseUrl)

    const seeded = await addBandcampTracks(
      FIXTURES.map(({ key }, i) => bandcampTrack(key, i)),
      [userId],
    )
    const trackIdByKey = {}
    const vectorByKey = {}
    for (const [i, { key, style, offset }] of FIXTURES.entries()) {
      const [{ track_id }] = await pg.queryRowsAsync(
        sql`SELECT track_id FROM store__track WHERE store__track_store_id = ${String(910000300 + i)}`,
      )
      trackIdByKey[key] = track_id
      vectorByKey[key] = trackVector(style, offset)
      await pg.queryAsync(sql`
        INSERT INTO store__track_preview_embedding (store__track_preview_id, store__track_preview_embedding_type, store__track_preview_embedding)
        SELECT store__track_preview_id, ${TYPE}, ${`[${vectorByKey[key].join(',')}]`}::VECTOR
        FROM store__track_preview NATURAL JOIN store__track
        WHERE track_id = ${track_id}
        ON CONFLICT DO NOTHING`)
    }

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

    return {
      server,
      baseUrl,
      req,
      rawKey,
      trackIdByKey,
      vectorByKey,
      ignoredArtistId,
      purchasedCartId,
      addedTracks: seeded.addedTracks,
      addedSources: [seeded.sourceId],
    }
  },

  teardown: async (ctx) => {
    ctx.server.kill()
    await pg.queryAsync(sql`DELETE FROM api_key WHERE api_key_hash = ${hashApiKey(ctx.rawKey)}`)
    await pg.queryAsync(sql`DELETE FROM user__artist_ignore WHERE artist_id = ${ctx.ignoredArtistId}`)
    await pg.queryAsync(
      sql`DELETE FROM track__cart WHERE cart_id = ${ctx.purchasedCartId} AND track_id = ${ctx.trackIdByKey.purchasedB}`,
    )
    await pg.queryAsync(sql`
      DELETE FROM store__track_preview_embedding
      WHERE store__track_preview_id IN (SELECT store__track_preview_id
                                        FROM store__track_preview NATURAL JOIN store__track
                                        WHERE track_id = ANY (${Object.values(ctx.trackIdByKey)}::INT[]))`)
    await teardownTracks(ctx)
  },

  'lists track-embedding/1 with preview coverage and its count': async ({ req, rawKey }) => {
    const { status, json } = await req('GET', '/api/embeddings/versions', { rawKey })
    expect(status).to.equal(200)
    const [listed, ...others] = json.versions
    expect(others).to.deep.equal([])
    expect(listed).to.deep.include({ version: VERSION, coverage: 'preview' })
    const [{ count }] = await pg.queryRowsAsync(
      sql`SELECT COUNT(*)::INT AS count FROM store__track_preview_embedding WHERE store__track_preview_embedding_type = ${TYPE}`,
    )
    expect(listed.count).to.equal(count)
  },

  'ranks each track by its nearest query vector, ascending': async ({ req, rawKey, trackIdByKey, vectorByKey }) => {
    const { status, json } = await search(req, rawKey, { limit: 200 })
    expect(status).to.equal(200)
    expect(json.version).to.equal(VERSION)
    const distances = json.tracks.map(({ distance }) => distance)
    expect(distances).to.deep.equal([...distances].sort((a, b) => a - b))

    const keyById = Object.fromEntries(Object.entries(trackIdByKey).map(([key, id]) => [id, key]))
    const seeded = json.tracks.filter(({ id }) => keyById[id])
    expect(seeded.map(({ id }) => keyById[id])).to.deep.equal(['nearA1', 'nearB1', 'nearA2'])
    for (const track of seeded) {
      const vector = vectorByKey[keyById[track.id]]
      const perQuery = QUERIES.map((q) => cosineDistance(vector, q))
      const nearest = Math.min(...perQuery)
      expect(track.distance).to.be.closeTo(nearest, 1e-5)
      expect(track.queryIndex).to.equal(perQuery.indexOf(nearest))
      expect(track.similarity).to.be.closeTo(1 - nearest, 1e-5)
    }
  },

  'leaves out heard, ignored and purchased tracks': async ({ req, rawKey, trackIdByKey }) => {
    const { json } = await search(req, rawKey, { limit: 200 })
    const ids = json.tracks.map(({ id }) => id)
    expect(ids).to.not.include.members([trackIdByKey.heardA])
    expect(ids).to.not.include.members([trackIdByKey.ignoredA])
    expect(ids).to.not.include.members([trackIdByKey.purchasedB])
  },

  'describes each track with its metadata, store links and Fomo Player link': async ({
    req,
    rawKey,
    baseUrl,
    trackIdByKey,
  }) => {
    const { json } = await search(req, rawKey, { vectors: [QUERIES[0]], limit: 1 })
    expect(json.tracks).to.have.length(1)
    const [track] = json.tracks
    expect(track.id).to.equal(trackIdByKey.nearA1)
    expect(track).to.deep.include({
      url: `${baseUrl}/search?q=track%3A${trackIdByKey.nearA1}`,
      queryIndex: 0,
      title: 'embedding search nearA1',
      version: null,
      releaseDate: '2026-04-01',
      remixers: [],
    })
    expect(track.artists.map(({ name }) => name)).to.deep.equal(['embedding search artist nearA1'])
    expect(track.artists[0]).to.have.keys(['id', 'name'])
    expect(track.labels).to.be.an('array')
    expect(track.stores).to.deep.equal([
      {
        name: 'Bandcamp',
        code: 'bandcamp',
        url: 'https://example.bandcamp.com/track/embedding-search-nearA1',
        releaseUrl: 'https://example.bandcamp.com/album/embedding-search-nearA1',
      },
    ])
    expect(track).to.have.property('durationMs')
  },

  'returns at most limit tracks': async ({ req, rawKey }) => {
    const { status, json } = await search(req, rawKey, { limit: 2 })
    expect(status).to.equal(200)
    expect(json.tracks).to.have.length(2)
  },

  'accepts the largest request: 50 vectors': async ({ req, rawKey }) => {
    const vectors = Array.from({ length: 50 }, (_, i) =>
      Array.from({ length: DIM }, (_, j) => (j === STYLE_AXIS[i % 2] ? 1 : 0) + Math.sin(i * DIM + j) * 0.0123456789),
    )
    const { status, json } = await search(req, rawKey, { vectors, limit: 200 })
    expect(status).to.equal(200)
    expect(json.tracks.length).to.be.greaterThan(0)
  },

  'answers 409 with the indexed versions for a version it does not index': async ({ req, rawKey }) => {
    const { status, json } = await search(req, rawKey, { version: 'track-embedding/2' })
    expect(status).to.equal(409)
    expect(json.error).to.equal('embedding_version_unsupported')
    expect(json.versions.map(({ version }) => version)).to.deep.equal([VERSION])
  },

  'answers 400 to a malformed request': async ({ req, rawKey }) => {
    const short = QUERIES[0].slice(1)
    const withString = QUERIES[0].map((x, i) => (i === 3 ? '0.5' : x))
    const zero = Array(DIM).fill(0)
    const cases = {
      'a vector of 1279 numbers': { vectors: [short] },
      'a number sent as a string': { vectors: [QUERIES[1], withString] },
      'an all-zero vector': { vectors: [zero] },
      'no vectors': { vectors: [] },
      '51 vectors': { vectors: Array(51).fill(QUERIES[0]) },
      'a limit over 200': { limit: 201 },
      'a fractional limit': { limit: 2.5 },
      'no coverage': { coverage: undefined },
      'no version': { version: undefined },
    }
    for (const [name, body] of Object.entries(cases)) {
      const { status, json } = await search(req, rawKey, body)
      expect(status, name).to.equal(400)
      expect(json.error, name).to.equal('invalid_request')
    }
  },

  'answers 400 to a malformed vector even for an unindexed version': async ({ req, rawKey }) => {
    const { status } = await search(req, rawKey, { version: 'track-embedding/2', vectors: [[1, 2, 3]] })
    expect(status).to.equal(400)
  },

  'answers 401 without a valid API key': async ({ req }) => {
    for (const authorization of [undefined, 'Bearer fp_not-a-key', 'Bearer not-an-api-key']) {
      for (const [method, path] of [
        ['GET', '/api/embeddings/versions'],
        ['POST', '/api/embeddings/similar-tracks'],
      ]) {
        const { status } = await req(method, path, {
          authorization,
          body: method === 'POST' ? { version: VERSION, coverage: 'full', vectors: QUERIES } : undefined,
        })
        expect(status, `${method} ${path} with ${authorization}`).to.equal(401)
      }
    }
  },

  'counts each request against the API key rate limit': {
    setup: async (ctx) => {
      const { raw: limitedKey } = await createTestApiKey()
      await pg.queryAsync(
        sql`UPDATE api_key SET rate_limit_per_minute = 1 WHERE api_key_hash = ${hashApiKey(limitedKey)}`,
      )
      return { ...ctx, limitedKey }
    },
    teardown: async ({ limitedKey }) => {
      await pg.queryAsync(sql`DELETE FROM api_key WHERE api_key_hash = ${hashApiKey(limitedKey)}`)
    },
    'the second request in a minute is refused with 429': async ({ req, limitedKey }) => {
      expect((await search(req, limitedKey, {})).status).to.equal(200)
      const refused = await search(req, limitedKey, {})
      expect(refused.status).to.equal(429)
    },
  },
})
