const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')

const { pg } = require('../../lib/db')
const { resolveTestUserId } = require('../../lib/test-user')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')

// The migration has already run on the empty test database; run its statements again over seeded rows.
const migrationSql = fs.readFileSync(
  path.resolve(__dirname, '../../../migrations/sqls/20261114180000-storage-urls-to-api-paths-up.sql'),
  'utf8',
)

const MINIO = 'https://bucket-production.example.test'
const BEATPORT_WAVEFORM = 'https://geo-media.beatport.com/image_size/1500x250/storage-urls-migration.png'

const bandcampTrack = {
  id: '930000001',
  url: 'https://example.bandcamp.com/track/storage-urls-migration',
  title: 'storage-urls migration fixture',
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [{ name: 'storage-urls artist', role: 'author', id: 'artist-storage-urls', url: 'https://su.bandcamp.com' }],
  release: {
    id: 'release-storage-urls',
    url: 'https://example.bandcamp.com/album/storage-urls',
    title: 'storage-urls release',
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    { format: 'mp3', url: 'https://example.bandcamp.com/preview/storage-urls.mp3', start_ms: 0, end_ms: 180000 },
  ],
}

const insertSample = async (userId, objectKey, url) => {
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO user_notification_audio_sample
          (meta_account_user_id, user_notification_audio_sample_bucket_name,
           user_notification_audio_sample_object_key, user_notification_audio_sample_url,
           user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
           user_notification_audio_sample_filename)
        VALUES (${userId}, 'sample-storage', ${objectKey}, ${url}, 1024, 'audio/mpeg', 'f.mp3')
        RETURNING user_notification_audio_sample_id AS id`,
  )
  return id
}

const sampleUrl = async (id) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT user_notification_audio_sample_url AS url FROM user_notification_audio_sample
          WHERE user_notification_audio_sample_id = ${id}`,
    )
  )[0].url

const waveformUrls = async (previewId) =>
  (
    await pg.queryRowsAsync(
      sql`SELECT store__track_preview_waveform_url AS url FROM store__track_preview_waveform
          WHERE store__track_preview_id = ${previewId} ORDER BY store__track_preview_waveform_url`,
    )
  ).map(({ url }) => url)

test({
  setup: async () => {
    const userId = await resolveTestUserId()
    const seed = await addBandcampTracks([bandcampTrack], [userId])
    const [{ previewId }] = await pg.queryRowsAsync(
      sql`SELECT store__track_preview_id AS "previewId" FROM store__track_preview NATURAL JOIN store__track
          WHERE track_id = ANY(${seed.addedTracks})`,
    )
    await pg.queryAsync(
      sql`INSERT INTO store__track_preview_waveform (store__track_preview_id, store__track_preview_waveform_url)
          VALUES (${previewId}, ${`${MINIO}/fomo-player-waveforms/0000c277-ab2c-44ba-ace8-54204c274bbf.png`}),
                 (${previewId}, ${BEATPORT_WAVEFORM})`,
    )
    const minioSampleId = await insertSample(
      userId,
      'notification-samples/1/storage-urls.mp3',
      `${MINIO}/sample-storage/notification-samples/1/storage-urls.mp3`,
    )
    const otherSampleId = await insertSample(userId, 'notification-samples/1/other.mp3', 'https://elsewhere.test/x.mp3')

    await pg.queryAsync(migrationSql)

    return { ...seed, previewId, sampleIds: [minioSampleId, otherSampleId] }
  },

  'a MinIO audio sample URL becomes an API path': async ({ sampleIds: [minioSampleId] }) => {
    assert.strictEqual(await sampleUrl(minioSampleId), '/api/storage/notification-samples/1/storage-urls.mp3')
  },

  'a sample URL that is not its own bucket path is left alone': async ({ sampleIds: [, otherSampleId] }) => {
    assert.strictEqual(await sampleUrl(otherSampleId), 'https://elsewhere.test/x.mp3')
  },

  'a generated waveform becomes an API path while a store waveform is left alone': async ({ previewId }) => {
    assert.deepStrictEqual(await waveformUrls(previewId), [
      '/api/storage/0000c277-ab2c-44ba-ace8-54204c274bbf.png',
      BEATPORT_WAVEFORM,
    ])
  },

  teardown: async (ctx) => {
    await pg.queryAsync(
      sql`DELETE FROM user_notification_audio_sample WHERE user_notification_audio_sample_id = ANY(${ctx.sampleIds})`,
    )
    await pg.queryAsync(sql`DELETE FROM store__track_preview_waveform WHERE store__track_preview_id = ${ctx.previewId}`)
    await teardownTracks(ctx)
  },
})
