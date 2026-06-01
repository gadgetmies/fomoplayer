const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')

const {
  queryFingerprintDiagnostics,
  findExactMatchForSample,
} = require('../../../routes/admin/db.js')
const {
  fingerprintDiagnosticsHandler,
} = require('../../../routes/admin/api.js')

// Seed helpers for hermetic fixture data. Returns the IDs needed to query
// the diagnostics and matcher functions.
const seedFingerprintPair = async () => {
  const [{ meta_account_user_id: userId }] = await pg.queryRowsAsync(sql`
    INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT) RETURNING meta_account_user_id
  `)
  const [{ track_id: trackId }] = await pg.queryRowsAsync(sql`
    INSERT INTO track (track_title) VALUES ('test track') RETURNING track_id
  `)
  const [{ store__track_id: storeTrackId }] = await pg.queryRowsAsync(sql`
    INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
    VALUES (${trackId}, 1, 'fp-diag-test', '{}')
    RETURNING store__track_id
  `)
  const [{ store__track_preview_id: previewId }] = await pg.queryRowsAsync(sql`
    INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
    VALUES (${storeTrackId}, 'http://example.com/preview.mp3', 'mp3')
    RETURNING store__track_preview_id
  `)
  const [{ user_notification_audio_sample_id: sampleId }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_notification_audio_sample
      (meta_account_user_id, user_notification_audio_sample_bucket_name,
       user_notification_audio_sample_object_key, user_notification_audio_sample_url,
       user_notification_audio_sample_file_size, user_notification_audio_sample_file_type)
    VALUES (${userId}, 'bucket', 'object', 'http://example.com/sample.mp3', 100, 'audio/mp3')
    RETURNING user_notification_audio_sample_id
  `)

  // Sample fingerprints: hashes 10, 20, 30, 40, 50 at positions 0..4.
  // Preview fingerprints: hashes 10, 20, 30, 60, 70, 80 at positions 1, 2, 3, 5, 6, 7.
  // Intersection on hash: {10, 20, 30} = 3 hashes.
  // Δt for matched hashes: all = 1.0s (coherent peak bucket).
  const sampleRows = [
    { hash: 10, position: 0.0, f1: 100 },
    { hash: 20, position: 1.0, f1: 200 },
    { hash: 30, position: 2.0, f1: 300 },
    { hash: 40, position: 3.0, f1: 400 },
    { hash: 50, position: 4.0, f1: 500 },
  ]
  const previewRows = [
    { hash: 10, position: 1.0, f1: 100 },
    { hash: 20, position: 2.0, f1: 200 },
    { hash: 30, position: 3.0, f1: 999 }, // hash matches but f1 differs
    { hash: 60, position: 5.0, f1: 600 },
    { hash: 70, position: 6.0, f1: 700 },
    { hash: 80, position: 7.0, f1: 800 },
  ]
  for (const r of sampleRows) {
    await pg.queryAsync(sql`
      INSERT INTO user_notification_audio_sample_fingerprint
        (user_notification_audio_sample_id, user_notification_audio_sample_fingerprint_hash,
         user_notification_audio_sample_fingerprint_position, user_notification_audio_sample_fingerprint_frequency_bin)
      VALUES (${sampleId}, ${r.hash}, ${r.position}, ${r.f1})
    `)
  }
  for (const r of previewRows) {
    await pg.queryAsync(sql`
      INSERT INTO store__track_preview_fingerprint
        (store__track_preview_id, store__track_preview_fingerprint_hash,
         store__track_preview_fingerprint_position, store__track_preview_fingerprint_frequency_bin)
      VALUES (${previewId}, ${r.hash}, ${r.position}, ${r.f1})
    `)
  }

  return { userId, sampleId, previewId, storeTrackId, trackId }
}

const cleanup = async ({ userId, previewId, trackId }) => {
  // Cascade deletes handle fingerprints + meta rows via FK ON DELETE CASCADE.
  await pg.queryAsync(sql`DELETE FROM store__track_preview WHERE store__track_preview_id = ${previewId}`)
  await pg.queryAsync(sql`DELETE FROM track WHERE track_id = ${trackId}`)
  await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userId}`)
}

test({
  setup: async () => {
    await initDb()
  },

  'queryFingerprintDiagnostics': {
    setup: seedFingerprintPair,
    teardown: cleanup,

    'reports per-side hash counts': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId)
      assert.strictEqual(d.sampleHashCount, 5, 'sample distinct-hash count')
      assert.strictEqual(d.previewHashCount, 6, 'preview distinct-hash count')
    },

    'reports intersection on hash and on (hash, f1)': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId)
      assert.strictEqual(d.intersectionHashCount, 3, 'hash-only intersection')
      // hash 30 has different f1 (300 vs 999), so (hash, f1) intersection drops it
      assert.strictEqual(d.intersectionHashWithF1Count, 2, '(hash, f1) intersection excludes the f1 mismatch')
    },

    'reports jaccard and containments': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId)
      // union = 5 + 6 - 3 = 8, jaccard = 3/8
      assert.strictEqual(d.jaccard, 3 / 8)
      assert.strictEqual(d.containmentAgainstSample, 3 / 5)
      assert.strictEqual(d.containmentAgainstPreview, 3 / 6)
    },

    'topOffsetBuckets surfaces the seeded Δt=1.0 peak': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId)
      assert.ok(d.topOffsetBuckets.length > 0, 'expected at least one bucket')
      const peak = d.topOffsetBuckets[0]
      assert.strictEqual(peak.deltaTSeconds, 1, 'peak Δt should be 1.0 seconds')
      assert.strictEqual(peak.count, 3, 'all three matched hashes should land in the peak bucket')
    },

    'currentScorerWouldReturn matches findExactMatchForSample math': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId)
      // findExactMatchForSample scores matching_hashes / sample_hash_count = 3/5.
      assert.strictEqual(d.currentScorerWouldReturn, 3 / 5)
    },

    'truncated is false for fixture sizes well under maxPerSide': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId)
      assert.strictEqual(d.truncated, false)
    },

    'truncated flips true when maxPerSide is lower than the seeded size': async ({ sampleId, previewId }) => {
      const d = await queryFingerprintDiagnostics(sampleId, previewId, { maxPerSide: 2 })
      assert.strictEqual(d.truncated, true, 'truncated should be true when fingerprint count exceeds maxPerSide')
    },
  },

  'fingerprintDiagnosticsHandler validates input before calling queryFn': {
    'missing sampleId returns 400 with documented body': async () => {
      let captured
      const res = {
        status(code) { captured = { code }; return this },
        send(body) { captured.body = body; return this },
      }
      const handler = fingerprintDiagnosticsHandler(async () => {
        throw new Error('queryFn should not be called when validation fails')
      })
      await handler({ query: { previewId: '1' } }, res)
      assert.deepStrictEqual(captured, {
        code: 400,
        body: { error: 'sampleId and previewId required as integers' },
      })
    },

    'non-numeric previewId returns 400': async () => {
      let captured
      const res = {
        status(code) { captured = { code }; return this },
        send(body) { captured.body = body; return this },
      }
      const handler = fingerprintDiagnosticsHandler(async () => {
        throw new Error('queryFn should not be called when validation fails')
      })
      await handler({ query: { sampleId: '1', previewId: 'not-a-number' } }, res)
      assert.strictEqual(captured.code, 400)
    },

    'non-positive bucketSeconds returns 400': async () => {
      let captured
      const res = {
        status(code) { captured = { code }; return this },
        send(body) { captured.body = body; return this },
      }
      const handler = fingerprintDiagnosticsHandler(async () => {
        throw new Error('queryFn should not be called when validation fails')
      })
      await handler({ query: { sampleId: '1', previewId: '2', bucketSeconds: '-0.1' } }, res)
      assert.strictEqual(captured.code, 400)
      assert.strictEqual(captured.body.error, 'bucketSeconds must be a positive number')
    },

    'happy path forwards parsed ints and bucketSeconds to the queryFn': async () => {
      const calls = []
      let sent
      const res = { send(body) { sent = body; return this } }
      const queryFn = async (sampleId, previewId, opts) => {
        calls.push({ sampleId, previewId, opts })
        return { sampleHashCount: 0, previewHashCount: 0, mocked: true }
      }
      const handler = fingerprintDiagnosticsHandler(queryFn)
      await handler({ query: { sampleId: '42', previewId: '99', bucketSeconds: '0.1' } }, res)
      assert.deepStrictEqual(calls, [
        { sampleId: 42, previewId: 99, opts: { bucketSeconds: 0.1 } },
      ])
      assert.strictEqual(sent.mocked, true)
    },

    'queryFn throw returns 500 and logs via the injected logger': async () => {
      let captured
      const logs = []
      const res = {
        status(code) { captured = { code }; return this },
        send(body) { captured.body = body; return this },
      }
      const log = { error: (msg, ctx) => logs.push({ msg, ctx }) }
      const handler = fingerprintDiagnosticsHandler(
        async () => { throw new Error('boom') },
        log,
      )
      await handler({ query: { sampleId: '1', previewId: '2' } }, res)
      assert.strictEqual(captured.code, 500)
      assert.strictEqual(captured.body.error, 'boom')
      assert.strictEqual(logs.length, 1, 'exactly one error log')
      assert.strictEqual(logs[0].msg, 'Error computing fingerprint diagnostics')
    },
  },

  'findExactMatchForSample emits one summary log per invocation': {
    setup: seedFingerprintPair,
    teardown: cleanup,

    'logs sampleHashCount and topPreviewId when match surfaces': async ({ sampleId, previewId }) => {
      // 3/5 = 0.6 surfaces above threshold 0.5
      const captured = []
      const log = { info: (msg, ctx) => captured.push({ msg, ctx }) }
      const rows = await findExactMatchForSample(sampleId, 0.5, { log })
      assert.ok(rows.length >= 1, 'expected at least one matching preview')
      assert.strictEqual(captured.length, 1, 'exactly one info log')
      const [{ msg, ctx }] = captured
      assert.strictEqual(msg, 'findExactMatchForSample')
      assert.strictEqual(ctx.sampleId, sampleId)
      assert.strictEqual(ctx.threshold, 0.5)
      assert.strictEqual(ctx.sampleHashCount, 5)
      assert.ok(ctx.candidateRowCount >= 1)
      assert.strictEqual(Number(ctx.topPreviewId), Number(previewId))
      assert.ok(ctx.topScore > 0)
    },

    'logs null topScore and topPreviewId when no match passes threshold': async ({ sampleId }) => {
      // 3/5 = 0.6, so threshold 0.99 should filter out everything
      const captured = []
      const log = { info: (msg, ctx) => captured.push({ msg, ctx }) }
      const rows = await findExactMatchForSample(sampleId, 0.99, { log })
      assert.strictEqual(rows.length, 0)
      assert.strictEqual(captured.length, 1, 'exactly one info log even with zero rows')
      const [{ msg, ctx }] = captured
      assert.strictEqual(msg, 'findExactMatchForSample')
      assert.strictEqual(ctx.sampleHashCount, 5, 'sampleHashCount even when no rows')
      assert.strictEqual(ctx.candidateRowCount, 0)
      assert.strictEqual(ctx.topScore, null)
      assert.strictEqual(ctx.topPreviewId, null)
    },
  },
})
