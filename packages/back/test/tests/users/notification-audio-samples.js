const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { pg } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')
const { queryNotificationAudioSamples } = require('../../../routes/users/db')

const BANDCAMP_IDS = ['910000001', '910000002', '910000003']

const bandcampTrack = (id, label) => ({
  id,
  url: `https://example.bandcamp.com/track/${label}`,
  title: `audio-samples fixture ${label}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `audio-samples artist ${label}`,
      role: 'author',
      id: `artist-${label}`,
      url: `https://${label}.bandcamp.com`,
    },
  ],
  release: {
    id: `release-${label}`,
    url: `https://example.bandcamp.com/album/${label}`,
    title: `audio-samples release ${label}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    { format: 'mp3', url: `https://example.bandcamp.com/preview/${label}.mp3`, start_ms: 0, end_ms: 180000 },
  ],
})

const insertSample = async (userId, objectKey) => {
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO user_notification_audio_sample
          (meta_account_user_id, user_notification_audio_sample_bucket_name,
           user_notification_audio_sample_object_key, user_notification_audio_sample_url,
           user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
           user_notification_audio_sample_filename)
        VALUES (${userId}, 'test-bucket', ${objectKey},
                ${'http://example.test/' + objectKey}, 1024, 'audio/mpeg',
                ${objectKey})
        RETURNING user_notification_audio_sample_id AS id`,
  )
  return id
}

const insertMatchRow = async (sampleId, previewId, score) => {
  await pg.queryAsync(
    sql`INSERT INTO user_notification_audio_sample_match
          (user_notification_audio_sample_id, store__track_preview_id,
           user_notification_audio_sample_match_score,
           user_notification_audio_sample_match_threshold,
           user_notification_audio_sample_match_bucket_seconds)
        VALUES (${sampleId}, ${previewId}, ${score}, 0.5, 0.064)`,
  )
}

const previewIdsForTracks = async (trackIds) => {
  const rows = await pg.queryRowsAsync(
    sql`SELECT store__track_preview_id AS id
        FROM store__track_preview
        NATURAL JOIN store__track
        WHERE track_id = ANY(${trackIds})
        ORDER BY store__track_preview_id`,
  )
  return rows.map((r) => r.id)
}

const createSecondUser = async () => {
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO meta_account DEFAULT VALUES
        RETURNING meta_account_user_id AS id`,
  )
  return id
}

test({
  setup: async () => {
    const userId = await resolveTestUserId()
    const otherUserId = await createSecondUser()

    const seed = await addBandcampTracks(
      BANDCAMP_IDS.map((bcId, i) => bandcampTrack(bcId, `p${i + 1}`)),
      [userId],
    )
    const previewIds = await previewIdsForTracks(seed.addedTracks)
    if (previewIds.length < 3) {
      throw new Error(`Expected at least 3 previews, got ${previewIds.length}`)
    }

    const sampleA = await insertSample(userId, `match-count-test-A-${userId}`)
    const sampleB = await insertSample(userId, `match-count-test-B-${userId}`)
    const sampleC = await insertSample(otherUserId, `match-count-test-C-${otherUserId}`)

    return {
      userId,
      otherUserId,
      sampleA,
      sampleB,
      sampleC,
      previewIds,
      addedTracks: seed.addedTracks,
      addedSources: [seed.sourceId],
    }
  },

  teardown: async (ctx) => {
    await pg.queryAsync(
      sql`DELETE FROM user_notification_audio_sample
          WHERE user_notification_audio_sample_id IN (${ctx.sampleA}, ${ctx.sampleB}, ${ctx.sampleC})`,
    )
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await teardownTracks(ctx)
  },

  'matchCount is 0 when the match table has no rows for the sample': async ({ userId, sampleA, sampleB }) => {
    const samples = await queryNotificationAudioSamples(userId)
    const a = samples.find((s) => s.id === sampleA)
    const b = samples.find((s) => s.id === sampleB)
    assert.strictEqual(a.matchCount, 0, 'sample A starts with matchCount 0')
    assert.strictEqual(b.matchCount, 0, 'sample B starts with matchCount 0')
  },

  'matchCount returns the per-sample count after inserts': async ({ userId, sampleA, sampleB, previewIds }) => {
    await insertMatchRow(sampleA, previewIds[0], 90)
    await insertMatchRow(sampleA, previewIds[1], 70)
    await insertMatchRow(sampleA, previewIds[2], 50)

    try {
      const samples = await queryNotificationAudioSamples(userId)
      const a = samples.find((s) => s.id === sampleA)
      const b = samples.find((s) => s.id === sampleB)
      assert.strictEqual(a.matchCount, 3, 'sample A has three matches')
      assert.strictEqual(b.matchCount, 0, 'sample B is untouched')
    } finally {
      await pg.queryAsync(
        sql`DELETE FROM user_notification_audio_sample_match
            WHERE user_notification_audio_sample_id = ${sampleA}`,
      )
    }
  },

  'counts are isolated across users — other users’ matches do not leak': async ({
    userId,
    otherUserId,
    sampleA,
    sampleC,
    previewIds,
  }) => {
    await insertMatchRow(sampleC, previewIds[0], 90)
    await insertMatchRow(sampleC, previewIds[1], 80)

    try {
      const samples = await queryNotificationAudioSamples(userId)
      const ids = samples.map((s) => s.id)
      assert.ok(ids.includes(sampleA), 'own sample appears')
      assert.ok(!ids.includes(sampleC), 'other user’s sample does NOT appear')

      const otherSamples = await queryNotificationAudioSamples(otherUserId)
      const c = otherSamples.find((s) => s.id === sampleC)
      assert.strictEqual(c.matchCount, 2, 'other user sees their own matchCount')
    } finally {
      await pg.queryAsync(
        sql`DELETE FROM user_notification_audio_sample_match
            WHERE user_notification_audio_sample_id = ${sampleC}`,
      )
    }
  },

  'existing additive shape is preserved': async ({ userId, sampleA }) => {
    const samples = await queryNotificationAudioSamples(userId)
    const a = samples.find((s) => s.id === sampleA)
    for (const field of ['id', 'url', 'objectKey', 'fileSize', 'fileType', 'filename', 'createdAt']) {
      assert.ok(field in a, `field ${field} must remain on response shape`)
    }
    assert.ok('matchCount' in a, 'matchCount must be added')
  },
})
