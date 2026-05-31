const { initDb, pg } = require('../../../lib/db.js')
const { addBandcampTracks, teardownTracks } = require('../../../lib/tracks.js')
const { searchForTracks } = require('../../../../routes/shared/db/search.js')
const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { resolveTestUserId } = require('../../../lib/test-user')

const BANDCAMP_IDS = ['920000001', '920000002', '920000003', '920000004']

const bandcampTrack = (id, label, releasedDate) => ({
  id,
  url: `https://example.bandcamp.com/track/${label}`,
  title: `sample-token fixture ${label}`,
  version: null,
  duration_ms: 180000,
  released: releasedDate,
  published: releasedDate,
  track_number: 1,
  isrc: null,
  artists: [
    { name: `sample-token artist ${label}`, role: 'author', id: `artist-${label}`, url: `https://${label}.bandcamp.com` },
  ],
  release: {
    id: `release-${label}`,
    url: `https://example.bandcamp.com/album/${label}`,
    title: `sample-token release ${label}`,
    release_date: releasedDate,
    catalog_number: null,
    isrc: null,
  },
  previews: [{ format: 'mp3', url: `https://example.bandcamp.com/preview/${label}.mp3`, start_ms: 0, end_ms: 180000 }],
})

const insertSample = async (userId, objectKey) => {
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO user_notification_audio_sample
          (meta_account_user_id, user_notification_audio_sample_bucket_name,
           user_notification_audio_sample_object_key, user_notification_audio_sample_url,
           user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
           user_notification_audio_sample_filename)
        VALUES (${userId}, 'test-bucket', ${objectKey},
                ${'http://example.test/' + objectKey}, 1024, 'audio/mpeg', ${objectKey})
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

const orderedPreviewIdsForTracks = async (trackIds) => {
  const rows = await pg.queryRowsAsync(
    sql`SELECT track_id, store__track_preview_id
        FROM store__track_preview NATURAL JOIN store__track
        WHERE track_id = ANY(${trackIds})
        ORDER BY array_position(${trackIds}::INT[], track_id)`,
  )
  return rows.map((r) => r.store__track_preview_id)
}

const getTrackArtistId = async (trackIds) => {
  const [{ artistId }] = await pg.queryRowsAsync(
    sql`SELECT MIN(artist_id) AS "artistId" FROM track NATURAL JOIN track__artist WHERE track_id = ANY(${trackIds})`,
  )
  return artistId
}

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const [{ id: otherUserId }] = await pg.queryRowsAsync(
      sql`INSERT INTO meta_account DEFAULT VALUES RETURNING meta_account_user_id AS id`,
    )

    // Three tracks released on different dates so we can prove the sort override
    // (default sort by released would yield t3, t2, t1 — but sample-match-score
    // ordering puts the highest-score preview first regardless of release date).
    const seed = await addBandcampTracks(
      [
        bandcampTrack(BANDCAMP_IDS[0], 'a', '2026-01-01T00:00:00Z'), // lowest score
        bandcampTrack(BANDCAMP_IDS[1], 'b', '2026-02-01T00:00:00Z'), // highest score
        bandcampTrack(BANDCAMP_IDS[2], 'c', '2026-03-01T00:00:00Z'), // middle score
        bandcampTrack(BANDCAMP_IDS[3], 'd', '2026-04-01T00:00:00Z'), // no match row
      ],
      [userId],
    )

    const previewIds = await orderedPreviewIdsForTracks(seed.addedTracks)
    const [trackA, trackB, trackC, trackD] = seed.addedTracks.map(Number)

    const ownerSampleId = await insertSample(userId, `sample-token-test-${userId}`)
    const otherSampleId = await insertSample(otherUserId, `sample-token-test-other-${otherUserId}`)

    await insertMatchRow(ownerSampleId, previewIds[0], 40) // trackA
    await insertMatchRow(ownerSampleId, previewIds[1], 90) // trackB
    await insertMatchRow(ownerSampleId, previewIds[2], 60) // trackC

    const artistAId = await getTrackArtistId([trackA])

    return {
      userId,
      otherUserId,
      ownerSampleId,
      otherSampleId,
      trackA,
      trackB,
      trackC,
      trackD,
      artistAId,
      addedTracks: seed.addedTracks,
      addedSources: [seed.sourceId],
    }
  },

  teardown: async (ctx) => {
    await pg.queryAsync(
      sql`DELETE FROM user_notification_audio_sample
          WHERE user_notification_audio_sample_id IN (${ctx.ownerSampleId}, ${ctx.otherSampleId})`,
    )
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await teardownTracks(ctx)
  },

  'owner search returns the matched tracks': async ({ userId, ownerSampleId, trackA, trackB, trackC }) => {
    const results = await searchForTracks(`sample:~${ownerSampleId}`, { userId })
    const ids = results.map((r) => r.id).sort()
    assert.deepStrictEqual(ids, [trackA, trackB, trackC].sort())
  },

  'non-owner search returns empty': async ({ otherUserId, ownerSampleId }) => {
    const results = await searchForTracks(`sample:~${ownerSampleId}`, { userId: otherUserId })
    assert.strictEqual(results.length, 0)
  },

  'non-existent sample id returns empty': async ({ userId }) => {
    const results = await searchForTracks(`sample:~999999`, { userId })
    assert.strictEqual(results.length, 0)
  },

  'malformed sample:~abc does not crash and ignores the token': async ({ userId, ownerSampleId, trackD }) => {
    // The malformed token is stripped by the field-filter regex (same fallback as
    // malformed track:~). The sample filter MUST NOT be applied. We seeded one
    // track with no match row (trackD); the valid sample search excludes it, the
    // malformed search must include it.
    const valid = await searchForTracks(`sample:~${ownerSampleId}`, { userId })
    const malformed = await searchForTracks(`sample:~abc`, { userId })
    assert.ok(!valid.map((r) => r.id).includes(trackD), 'valid sample search excludes unmatched track')
    assert.ok(malformed.map((r) => r.id).includes(trackD), 'malformed token must not filter out unmatched tracks')
  },

  'AND-combines with artist filter': async ({ userId, ownerSampleId, artistAId, trackA }) => {
    const results = await searchForTracks(`sample:~${ownerSampleId} artist:${artistAId}`, { userId })
    const ids = results.map((r) => r.id)
    assert.deepStrictEqual(ids, [trackA])
  },

  'AND-combines with onlyNew=true': async ({ userId, ownerSampleId, trackA, trackB, trackC }) => {
    // onlyNew is implemented at the route layer as a parameter passed in; here we
    // pass it directly. All seeded tracks are unheard, so onlyNew is a no-op
    // intersection in this fixture but must not throw or drop the sample filter.
    const results = await searchForTracks(`sample:~${ownerSampleId}`, { userId, onlyNew: true })
    const ids = results.map((r) => r.id).sort()
    assert.deepStrictEqual(ids, [trackA, trackB, trackC].sort())
  },

  'default sort orders by descending match score': async ({ userId, ownerSampleId, trackA, trackB, trackC }) => {
    // No sort param → override fires. Expected order is trackB (90), trackC (60), trackA (40).
    const results = await searchForTracks(`sample:~${ownerSampleId}`, { userId })
    const ids = results.map((r) => r.id)
    assert.deepStrictEqual(ids, [trackB, trackC, trackA])
  },

  'explicit sort wins over the match-score override': async ({ userId, ownerSampleId, trackA, trackB, trackC }) => {
    // sort=-released → trackC (2026-03), trackB (2026-02), trackA (2026-01).
    const results = await searchForTracks(`sample:~${ownerSampleId}`, { userId, sort: '-released' })
    const ids = results.map((r) => r.id)
    assert.deepStrictEqual(ids, [trackC, trackB, trackA])
  },
})
