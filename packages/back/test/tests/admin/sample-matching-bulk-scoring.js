const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')

const { bulkScoreSamplesHandler } = require('../../../routes/admin/api.js')

// Same fingerprint fixtures the regression suite uses — they give the
// matcher a real corpus so we can assert on row counts and top_score
// rather than mocking findExactMatchForSample wholesale.
const FIXTURE_DIR = path.join(__dirname, '../../fixtures/sample-matching')
const FIXTURES = ['mantra_full', 'mantra_preview', 'mantra_rec']

const loadFingerprints = (name) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')).fingerprints

const seedFixtures = async () => {
  const [{ meta_account_user_id: userId }] = await pg.queryRowsAsync(sql`
    INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT)
    RETURNING meta_account_user_id
  `)

  const sampleIds = {}
  const previewIds = {}
  const trackIds = []

  for (const name of FIXTURES) {
    const fps = loadFingerprints(name)

    const [{ track_id: trackId }] = await pg.queryRowsAsync(sql`
      INSERT INTO track (track_title) VALUES (${`bulk-fixture ${name}`}) RETURNING track_id
    `)
    trackIds.push(trackId)
    const [{ store__track_id: storeTrackId }] = await pg.queryRowsAsync(sql`
      INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
      VALUES (${trackId}, 1, ${`bulk-${name}`}, '{}')
      RETURNING store__track_id
    `)
    const [{ store__track_preview_id: previewId }] = await pg.queryRowsAsync(sql`
      INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
      VALUES (${storeTrackId}, ${`http://example.com/bulk-${name}.mp3`}, 'mp3')
      RETURNING store__track_preview_id
    `)
    previewIds[name] = previewId

    const [{ user_notification_audio_sample_id: sampleId }] = await pg.queryRowsAsync(sql`
      INSERT INTO user_notification_audio_sample
        (meta_account_user_id, user_notification_audio_sample_bucket_name,
         user_notification_audio_sample_object_key, user_notification_audio_sample_url,
         user_notification_audio_sample_file_size, user_notification_audio_sample_file_type)
      VALUES (${userId}, 'bucket', ${`bulk-object-${name}`}, ${`http://example.com/bulk-${name}.mp3`}, 100, 'audio/mp3')
      RETURNING user_notification_audio_sample_id
    `)
    sampleIds[name] = sampleId

    const payload = JSON.stringify(
      fps.map((fp) => ({
        hash: String(fp.hash),
        position: fp.position,
        f1: fp.f1 === null || fp.f1 === undefined ? null : fp.f1,
      })),
    )
    await pg.queryAsync(sql`
      INSERT INTO store__track_preview_fingerprint
        (store__track_preview_id, store__track_preview_fingerprint_hash,
         store__track_preview_fingerprint_position, store__track_preview_fingerprint_frequency_bin)
      SELECT ${previewId}::BIGINT, rec.hash::BIGINT, rec.position::FLOAT, rec.f1
      FROM json_to_recordset(${payload}::json) AS rec (hash TEXT, position FLOAT, f1 INTEGER)
    `)
    await pg.queryAsync(sql`
      INSERT INTO user_notification_audio_sample_fingerprint
        (user_notification_audio_sample_id, user_notification_audio_sample_fingerprint_hash,
         user_notification_audio_sample_fingerprint_position, user_notification_audio_sample_fingerprint_frequency_bin)
      SELECT ${sampleId}::BIGINT, rec.hash::BIGINT, rec.position::FLOAT, rec.f1
      FROM json_to_recordset(${payload}::json) AS rec (hash TEXT, position FLOAT, f1 INTEGER)
    `)
    // queryAudioSamplesWithFingerprint joins on _fingerprint_meta, so each
    // sample needs a meta row to be visible to the "score everything" path.
    await pg.queryAsync(sql`
      INSERT INTO user_notification_audio_sample_fingerprint_meta
        (user_notification_audio_sample_id,
         user_notification_audio_sample_fingerprint_count,
         user_notification_audio_sample_fingerprint_extracted_at)
      VALUES (${sampleId}, ${fps.length}, NOW())
    `)
  }

  return { userId, sampleIds, previewIds, trackIds }
}

const cleanup = async ({ userId, previewIds, trackIds }) => {
  for (const previewId of Object.values(previewIds)) {
    await pg.queryAsync(sql`DELETE FROM store__track_preview WHERE store__track_preview_id = ${previewId}`)
  }
  for (const trackId of trackIds) {
    await pg.queryAsync(sql`DELETE FROM track WHERE track_id = ${trackId}`)
  }
  await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userId}`)
}

// Stage 1 threshold that surfaces the regression-test mantra pair.
const TEST_THRESHOLD = 0.008

// Minimal fake res that captures status + body, matching the express subset
// the handler uses (status().send() and send()).
const fakeRes = () => {
  const r = { statusCode: 200, body: undefined }
  r.status = (code) => {
    r.statusCode = code
    return r
  }
  r.send = (b) => {
    r.body = b
    return r
  }
  return r
}

const silentLog = { error: () => {}, info: () => {}, warn: () => {} }

const invoke = async (body, overrides = {}) => {
  const res = fakeRes()
  const handler = bulkScoreSamplesHandler({ log: silentLog, ...overrides })
  await handler({ body }, res)
  return res
}

const countMatchRows = async (sampleId) => {
  const [{ count }] = await pg.queryRowsAsync(sql`
    SELECT COUNT(*)::INT AS count
    FROM user_notification_audio_sample_match
    WHERE user_notification_audio_sample_id = ${sampleId}
  `)
  return count
}

test({
  setup: async () => {
    await initDb()
  },

  'bulkScoreSamplesHandler': {
    setup: seedFixtures,
    teardown: cleanup,

    'omitted sample_ids scores every sample with fingerprints': async ({ sampleIds }) => {
      const res = await invoke({ threshold: TEST_THRESHOLD })
      assert.strictEqual(res.statusCode, 200)
      const ids = res.body.results.map((r) => r.sample_id).sort((a, b) => a - b)
      const expected = Object.values(sampleIds).sort((a, b) => a - b)
      assert.deepStrictEqual(ids, expected)
      assert.strictEqual(res.body.ok_count, expected.length)
      assert.strictEqual(res.body.fail_count, 0)
    },

    'explicit sample_ids scores the named subset': async ({ sampleIds }) => {
      const targetIds = [sampleIds.mantra_rec, sampleIds.mantra_full]
      const res = await invoke({ sample_ids: targetIds, threshold: TEST_THRESHOLD })
      assert.strictEqual(res.statusCode, 200)
      const ids = res.body.results.map((r) => r.sample_id).sort((a, b) => a - b)
      assert.deepStrictEqual(ids, [...targetIds].sort((a, b) => a - b))
    },

    'empty sample_ids array returns 400 and writes nothing': async ({ sampleIds }) => {
      const before = await countMatchRows(sampleIds.mantra_rec)
      const res = await invoke({ sample_ids: [] })
      assert.strictEqual(res.statusCode, 400)
      const after = await countMatchRows(sampleIds.mantra_rec)
      assert.strictEqual(after, before, 'no rows should have been written')
    },

    'threshold override is honoured downstream': async ({ sampleIds }) => {
      let observedThreshold = null
      const persistCalls = []
      const handler = bulkScoreSamplesHandler({
        log: silentLog,
        findExactMatch: async (_id, threshold) => {
          observedThreshold = threshold
          return []
        },
        persistMatches: async (sampleId, matches, threshold, bucketSeconds) => {
          persistCalls.push({ sampleId, threshold, bucketSeconds })
        },
      })
      const res = fakeRes()
      await handler(
        { body: { sample_ids: [sampleIds.mantra_rec], threshold: 0.5 } },
        res,
      )
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(observedThreshold, 0.5)
      assert.strictEqual(persistCalls.length, 1)
      assert.strictEqual(persistCalls[0].threshold, 0.5)
    },

    'one bad sample yields status: error while others succeed': async ({ sampleIds }) => {
      const badId = sampleIds.mantra_full
      const handler = bulkScoreSamplesHandler({
        log: silentLog,
        findExactMatch: async (id) => {
          if (id === badId) throw new Error('boom')
          return [{ store__track_preview_id: 1, match_score: 42 }]
        },
        persistMatches: async () => {},
      })
      const res = fakeRes()
      const ids = Object.values(sampleIds)
      await handler({ body: { sample_ids: ids, threshold: TEST_THRESHOLD } }, res)
      assert.strictEqual(res.statusCode, 200)
      assert.strictEqual(res.body.ok_count, ids.length - 1)
      assert.strictEqual(res.body.fail_count, 1)
      const bad = res.body.results.find((r) => r.sample_id === badId)
      assert.strictEqual(bad.status, 'error')
      assert.match(bad.error, /boom/)
      for (const r of res.body.results) {
        if (r.sample_id !== badId) {
          assert.strictEqual(r.status, 'ok')
          assert.strictEqual(r.match_count, 1)
          assert.strictEqual(r.top_score, 42)
        }
      }
    },

    'rows land in user_notification_audio_sample_match with effective threshold and bucket_seconds':
      async ({ sampleIds }) => {
        const targetId = sampleIds.mantra_rec
        const res = await invoke({ sample_ids: [targetId], threshold: TEST_THRESHOLD })
        assert.strictEqual(res.statusCode, 200)
        const targetResult = res.body.results.find((r) => r.sample_id === targetId)
        assert.strictEqual(targetResult.status, 'ok')
        assert.ok(targetResult.match_count >= 1, 'expected at least one match for mantra_rec')

        const rows = await pg.queryRowsAsync(sql`
          SELECT user_notification_audio_sample_match_score AS score,
                 user_notification_audio_sample_match_threshold AS threshold,
                 user_notification_audio_sample_match_bucket_seconds AS bucket_seconds
          FROM user_notification_audio_sample_match
          WHERE user_notification_audio_sample_id = ${targetId}
        `)
        assert.strictEqual(rows.length, targetResult.match_count)
        const config = require('../../../config.js')
        const expectedBucket = config.sampleMatchBucketSeconds ?? 0.05
        for (const row of rows) {
          assert.strictEqual(parseFloat(row.threshold), TEST_THRESHOLD)
          assert.strictEqual(parseFloat(row.bucket_seconds), expectedBucket)
        }
      },
  },
})
