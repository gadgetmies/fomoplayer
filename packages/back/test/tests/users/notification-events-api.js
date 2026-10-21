'use strict'
const { expect } = require('chai')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const { initDb, pg } = require('../../lib/db')
const { startServer } = require('../../lib/server')
const { createTestApiKey } = require('../../lib/api-key')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')
const { persistSampleMatches } = require('../../../routes/admin/db')
const { EMBEDDING_TYPE } = require('../../../routes/shared/db/cart-similarity')

// The notification events API, the per-sample matches endpoint and Sounds like.

const DIMENSIONS = 1280
// Unit-length vectors in the first two dimensions: cosine similarity to the sample (angle 0) is cos(angle).
const vector = (degrees) => {
  const v = new Array(DIMENSIONS).fill(0)
  v[0] = Math.cos((degrees * Math.PI) / 180)
  v[1] = Math.sin((degrees * Math.PI) / 180)
  return `[${v.join(',')}]`
}

// close: nearest; near: second; matched: identical to the sample but a fingerprint match; ignored: by an ignored
// artist; far: shares close's artist and label, so that artist tops the follow tally.
const FIXTURES = [
  { key: 'close', angle: 10, artist: 'shared' },
  { key: 'near', angle: 30, artist: 'near' },
  { key: 'matched', angle: 0, artist: 'matched' },
  { key: 'ignored', angle: 5, artist: 'ignored' },
  { key: 'far', angle: 60, artist: 'shared' },
]

const bandcampTrack = ({ key, artist }, index) => ({
  id: String(940000100 + index),
  url: `https://example.bandcamp.com/track/notification-api-${key}`,
  title: `notification api ${key}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `notification api artist ${artist}`,
      role: 'author',
      id: `notification-api-artist-${artist}`,
      url: `https://notification-api-${artist}.bandcamp.com`,
    },
  ],
  release: {
    id: `notification-api-release-${key}`,
    url: `https://example.bandcamp.com/album/notification-api-${key}`,
    title: `notification api release ${key}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    {
      format: 'mp3',
      url: `https://example.bandcamp.com/preview/notification-api-${key}.mp3`,
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

const insertSample = async (userId, objectKey) => {
  const [{ id }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_notification_audio_sample
      (meta_account_user_id, user_notification_audio_sample_bucket_name,
       user_notification_audio_sample_object_key, user_notification_audio_sample_url,
       user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
       user_notification_audio_sample_filename)
    VALUES (${userId}, 'bucket', ${objectKey}, ${`http://example.test/${objectKey}`}, 1, 'audio/mpeg', ${objectKey})
    RETURNING user_notification_audio_sample_id AS id
  `)
  return id
}

const insertSearchEvent = async (userId, notificationId, trackId) => {
  const [{ id }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_notification_event (meta_account_user_id, track_id, user_search_notification_id)
    VALUES (${userId}, ${trackId}, ${notificationId})
    RETURNING user_notification_event_id AS id
  `)
  return id
}

test({
  setup: async () => {
    await initDb()
    const { server, port } = await startServer()
    const { raw, userId } = await createTestApiKey()
    const req = makeRequest(`http://localhost:${port}`, raw)
    await pg.queryAsync(sql`DELETE FROM user_notification_event WHERE meta_account_user_id = ${userId}`)

    const [{ id: otherUserId }] = await pg.queryRowsAsync(
      sql`INSERT INTO meta_account DEFAULT VALUES RETURNING meta_account_user_id AS id`,
    )

    const seeded = await addBandcampTracks(FIXTURES.map(bandcampTrack), [userId])
    const tracks = {}
    for (const [index, fixture] of FIXTURES.entries()) {
      const [row] = await pg.queryRowsAsync(sql`
        SELECT track_id AS "trackId", store__track_preview_id AS "previewId"
        FROM store__track NATURAL JOIN store__track_preview
        WHERE store__track_store_id = ${String(940000100 + index)}
      `)
      tracks[fixture.key] = row
      await pg.queryAsync(sql`
        INSERT INTO store__track_preview_embedding
          (store__track_preview_id, store__track_preview_embedding, store__track_preview_embedding_type)
        VALUES (${row.previewId}, ${vector(fixture.angle)}::VECTOR, ${EMBEDDING_TYPE})
      `)
    }

    const [{ artist_id: ignoredArtistId }] = await pg.queryRowsAsync(sql`
      SELECT artist_id FROM track__artist WHERE track_id = ${tracks.ignored.trackId}
    `)
    await pg.queryAsync(sql`
      INSERT INTO user__artist_ignore (artist_id, meta_account_user_id) VALUES (${ignoredArtistId}, ${userId})
    `)

    const [{ id: notificationId }] = await pg.queryRowsAsync(sql`
      INSERT INTO user_search_notification (meta_account_user_id, user_search_notification_string)
      VALUES (${userId}, 'notification api search')
      RETURNING user_search_notification_id AS id
    `)

    const sampleId = await insertSample(userId, `notification-api-sample-${userId}`)
    const emptySampleId = await insertSample(userId, `notification-api-empty-${userId}`)
    const otherSampleId = await insertSample(otherUserId, `notification-api-other-${otherUserId}`)
    await pg.queryAsync(sql`
      INSERT INTO user_notification_audio_sample_embedding
        (user_notification_audio_sample_id, user_notification_audio_sample_embedding,
         user_notification_audio_sample_embedding_type)
      VALUES (${sampleId}, ${vector(0)}::VECTOR, ${EMBEDDING_TYPE})
    `)

    return {
      server,
      req,
      userId,
      otherUserId,
      tracks,
      ignoredArtistId,
      notificationId,
      sampleId,
      emptySampleId,
      otherSampleId,
      addedTracks: seeded.addedTracks,
      addedSources: [seeded.sourceId],
    }
  },

  teardown: async (ctx) => {
    ctx.server.kill()
    await pg.queryAsync(sql`DELETE FROM user_notification_event WHERE meta_account_user_id = ${ctx.userId}`)
    await pg.queryAsync(sql`DELETE FROM user_search_notification WHERE user_search_notification_id = ${ctx.notificationId}`)
    await pg.queryAsync(sql`
      DELETE FROM user_notification_audio_sample
      WHERE user_notification_audio_sample_id IN (${ctx.sampleId}, ${ctx.emptySampleId}, ${ctx.otherSampleId})
    `)
    await pg.queryAsync(sql`
      DELETE FROM user__artist_ignore WHERE artist_id = ${ctx.ignoredArtistId} AND meta_account_user_id = ${ctx.userId}
    `)
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await pg.queryAsync(sql`
      DELETE FROM store__track_preview_embedding
      WHERE store__track_preview_id = ANY (${Object.values(ctx.tracks).map(({ previewId }) => previewId)}::INT[])
    `)
    await teardownTracks(ctx)
  },

  events: {
    setup: async (ctx) => {
      const { userId, otherUserId, notificationId, tracks } = ctx
      await pg.queryAsync(sql`DELETE FROM user_notification_event WHERE meta_account_user_id = ${userId}`)
      const ids = []
      for (const key of ['close', 'near', 'far']) {
        ids.push(await insertSearchEvent(userId, notificationId, tracks[key].trackId))
      }
      const [{ id: otherNotificationId }] = await pg.queryRowsAsync(sql`
        INSERT INTO user_search_notification (meta_account_user_id, user_search_notification_string)
        VALUES (${otherUserId}, 'notification api other')
        RETURNING user_search_notification_id AS id
      `)
      await insertSearchEvent(otherUserId, otherNotificationId, tracks.close.trackId)
      return { ...ctx, eventIds: ids, otherNotificationId }
    },
    teardown: async ({ userId, otherNotificationId }) => {
      await pg.queryAsync(sql`DELETE FROM user_notification_event WHERE meta_account_user_id = ${userId}`)
      await pg.queryAsync(
        sql`DELETE FROM user_search_notification WHERE user_search_notification_id = ${otherNotificationId}`,
      )
    },

    'lists the caller events newest first with reason and track, paginated': async ({ req, eventIds, tracks }) => {
      const first = await req('GET', '/api/me/notifications/events?limit=2')
      expect(first.status).to.equal(200)
      expect(first.json.map(({ id }) => id)).to.deep.equal([eventIds[2], eventIds[1]])
      expect(first.json[0]).to.include({ read: false })
      expect(first.json[0].reason).to.include({ type: 'search', text: 'notification api search' })
      expect(first.json[0].track.id).to.equal(tracks.far.trackId)
      expect(first.json[0].track.title).to.equal('notification api far')

      const second = await req('GET', `/api/me/notifications/events?limit=2&before=${eventIds[1]}`)
      expect(second.json.map(({ id }) => id)).to.deep.equal([eventIds[0]])
    },

    'rejects a non-integer limit or before': async ({ req }) => {
      for (const path of ['/api/me/notifications/events?limit=abc', '/api/me/notifications/events?before=-1']) {
        expect((await req('GET', path)).status, path).to.equal(400)
      }
      expect((await req('POST', '/api/me/notifications/events/read', { trackIds: ['x'] })).status).to.equal(400)
    },

    'counts unread events and marks them read by track, by hearing and all at once': async ({
      req,
      tracks,
      otherUserId,
    }) => {
      const count = async () => (await req('GET', '/api/me/notifications/events/unread-count')).json.count
      expect(await count()).to.equal(3)

      const byTrack = await req('POST', '/api/me/notifications/events/read', { trackIds: [tracks.near.trackId] })
      expect(byTrack.json).to.deep.equal({ count: 1 })
      expect(await count()).to.equal(2)

      expect((await req('POST', `/api/me/tracks/${tracks.close.trackId}`, { heard: true })).status).to.equal(200)
      expect(await count()).to.equal(1)
      const [{ unread: otherUnread }] = await pg.queryRowsAsync(sql`
        SELECT COUNT(*)::INT AS unread FROM user_notification_event
        WHERE meta_account_user_id = ${otherUserId} AND user_notification_event_read_at IS NULL
      `)
      expect(otherUnread, 'hearing a track leaves other users events unread').to.equal(1)

      expect((await req('POST', '/api/me/notifications/events/read', { all: true })).json).to.deep.equal({ count: 1 })
      expect(await count()).to.equal(0)
    },

    'never returns other users events': async ({ req, otherNotificationId }) => {
      const { json } = await req('GET', '/api/me/notifications/events')
      expect(json.every(({ reason }) => reason.notificationId !== otherNotificationId)).to.equal(true)
    },
  },

  'sample matches': {
    setup: async (ctx) => {
      const { sampleId, tracks } = ctx
      await persistSampleMatches(
        sampleId,
        [
          {
            store__track_preview_id: tracks.matched.previewId,
            match_score: 20,
            peak_offset_seconds: 41.5,
            peak_tempo_factor: 0.996,
          },
          { store__track_preview_id: tracks.near.previewId, match_score: 5 },
        ],
        0.01,
        0.5,
      )
      return ctx
    },
    teardown: async ({ sampleId }) => {
      await persistSampleMatches(sampleId, [], 0.01, 0.5)
    },

    'returns matches by score with offset, tempo and unread state': async ({ req, sampleId, tracks }) => {
      const { status, json } = await req('GET', `/api/me/notifications/audio-samples/${sampleId}/matches`)
      expect(status).to.equal(200)
      expect(json.map(({ id }) => id)).to.deep.equal([tracks.matched.trackId, tracks.near.trackId])
      expect(json[0].match).to.include({ previewId: tracks.matched.previewId, score: 20, offsetSeconds: 41.5, tempoFactor: 0.996 })
      expect(json[0].unread).to.equal(true)
      expect(json[0].title).to.equal('notification api matched')
      expect(json[1].match).to.include({ offsetSeconds: null, tempoFactor: null })
    },

    'returns 404 for another user sample': async ({ req, otherSampleId }) => {
      expect((await req('GET', `/api/me/notifications/audio-samples/${otherSampleId}/matches`)).status).to.equal(404)
      expect((await req('GET', `/api/me/notifications/audio-samples/${otherSampleId}/similar`)).status).to.equal(404)
    },

    'sounds like ranks by similarity, leaving out matches and ignored artists': async ({ req, sampleId, tracks }) => {
      const { status, json } = await req('GET', `/api/me/notifications/audio-samples/${sampleId}/similar?limit=50`)
      expect(status).to.equal(200)
      expect(json.pending).to.equal(false)
      const ours = json.tracks.map(({ id }) => id).filter((id) => Object.values(tracks).some((t) => t.trackId === id))
      expect(ours).to.deep.equal([tracks.close.trackId, tracks.far.trackId])
      const close = json.tracks.find(({ id }) => id === tracks.close.trackId)
      expect(close.similarity).to.be.closeTo(Math.cos((10 * Math.PI) / 180), 1e-4)
    },

    'sounds like suggests the most frequent artist first': async ({ req, sampleId }) => {
      const { json } = await req('GET', `/api/me/notifications/audio-samples/${sampleId}/similar?limit=50`)
      const [top] = json.follow
      expect(top).to.include({ type: 'artist', name: 'notification api artist shared', count: 2, followed: false })
      expect(json.follow.length).to.be.at.most(5)
    },

    'sounds like is pending for a sample without an embedding': async ({ req, emptySampleId }) => {
      const { json } = await req('GET', `/api/me/notifications/audio-samples/${emptySampleId}/similar`)
      expect(json).to.deep.equal({ tracks: [], follow: [], pending: true })
    },
  },
})
