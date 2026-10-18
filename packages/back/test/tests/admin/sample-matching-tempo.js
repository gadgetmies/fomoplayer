const assert = require('assert')
const { test } = require('cascade-test')
const { initDb } = require('../../lib/db.js')
const {
  loadFingerprints,
  createUser,
  seedPreview,
  seedSample,
  removeSeeded,
} = require('../../lib/fingerprint-fixtures.js')

const { findExactMatchForSample } = require('../../../routes/admin/db.js')
const { matchFingerprints, tempoFactorGrid } = require('../../../routes/shared/db/fingerprint-matching.js')

// Same Stage 1 threshold as sample-matching-regression.js.
const THRESHOLD = 0.008
const BUCKET_SECONDS = 0.5

// The stretched fixtures are analyser/data/*_full renders processed with sox:
// `speed 1.08` (vinyl-style: tempo and pitch +8 %) and `tempo 0.92`
// (keylock: tempo −8 %, pitch unchanged).
const PREVIEWS = ['mantra_preview', 'serious_sound_preview']
const SAMPLES = ['mantra_full_speed108', 'serious_sound_full_tempo092', 'mantra_rec']

// The slope-1 scorer, computed in JS: peak count of round((p − s) / bucket).
const slopeOnePeak = (sampleFps, previewFps) => {
  const byHash = new Map()
  for (const fp of previewFps) {
    const key = String(fp.hash)
    if (!byHash.has(key)) byHash.set(key, [])
    byHash.get(key).push(fp.position)
  }
  const counts = new Map()
  for (const fp of sampleFps) {
    for (const p of byHash.get(String(fp.hash)) || []) {
      const bucket = Math.round((p - fp.position) / BUCKET_SECONDS)
      counts.set(bucket, (counts.get(bucket) || 0) + 1)
    }
  }
  return Math.max(0, ...counts.values())
}

const rowFor = (rows, previewId) => rows.find((r) => String(r.store__track_preview_id) === String(previewId))

test({
  tempoFactorGrid: {
    'zero deviation is exactly the slope-1 scorer': () => {
      assert.deepStrictEqual(tempoFactorGrid({ maxDeviation: 0, bucketSeconds: 0.5, spanSeconds: 120 }), [1])
    },
    'grid is symmetric, contains 1 and reaches the deviation': () => {
      const grid = tempoFactorGrid({ maxDeviation: 0.08, bucketSeconds: 0.5, spanSeconds: 30 })
      assert(grid.includes(1))
      assert.strictEqual(grid[0], 0.92)
      assert.strictEqual(grid[grid.length - 1], 1.08)
      assert.strictEqual(grid.length % 2, 1)
    },
    'step follows bucket / span and is clamped at 0.0025': () => {
      const short = tempoFactorGrid({ maxDeviation: 0.08, bucketSeconds: 0.5, spanSeconds: 30 })
      assert(short[1] - short[0] <= 0.5 / 30 + 1e-9)
      const long = tempoFactorGrid({ maxDeviation: 0.08, bucketSeconds: 0.5, spanSeconds: 3600 })
      assert(long[1] - long[0] >= 0.0025 - 1e-9)
    },
  },

  'tempo-aware matching': {
    setup: async () => {
      await initDb()
      const userId = await createUser()
      const previewIds = {}
      const sampleIds = {}
      const trackIds = []
      for (const name of PREVIEWS) {
        const { trackId, previewId } = await seedPreview(name, loadFingerprints(name))
        previewIds[name] = previewId
        trackIds.push(trackId)
      }
      for (const name of SAMPLES) {
        sampleIds[name] = await seedSample(userId, name, loadFingerprints(name))
      }
      return { userId, trackIds, previewIds, sampleIds }
    },
    teardown: removeSeeded,

    'vinyl-style +8 % recording matches its preview at tempo factor 1.08': async ({ sampleIds, previewIds }) => {
      const rows = await findExactMatchForSample(sampleIds.mantra_full_speed108, THRESHOLD)
      assert.strictEqual(String(rows[0]?.store__track_preview_id), String(previewIds.mantra_preview))
      assert(Math.abs(rows[0].peak_tempo_factor - 1.08) <= 0.01, `tempo factor ${rows[0].peak_tempo_factor}`)
    },

    'keylock −8 % recording matches its preview at tempo factor 0.92': async ({ sampleIds, previewIds }) => {
      const rows = await findExactMatchForSample(sampleIds.serious_sound_full_tempo092, THRESHOLD)
      assert.strictEqual(String(rows[0]?.store__track_preview_id), String(previewIds.serious_sound_preview))
      assert(Math.abs(rows[0].peak_tempo_factor - 0.92) <= 0.01, `tempo factor ${rows[0].peak_tempo_factor}`)
    },

    'tempo search recovers several times the slope-1 score': async ({ sampleIds, previewIds }) => {
      for (const [sample, preview] of [
        ['mantra_full_speed108', 'mantra_preview'],
        ['serious_sound_full_tempo092', 'serious_sound_preview'],
      ]) {
        const aware = rowFor(await findExactMatchForSample(sampleIds[sample], THRESHOLD), previewIds[preview])
        const slopeOne = slopeOnePeak(loadFingerprints(sample), loadFingerprints(preview))
        assert(aware.match_score >= 3 * slopeOne, `${sample}: ${aware.match_score} vs slope-1 ${slopeOne}`)
      }
    },

    'stretched recordings do not surface the other song': async ({ sampleIds, previewIds }) => {
      const mantra = await findExactMatchForSample(sampleIds.mantra_full_speed108, THRESHOLD)
      assert.strictEqual(rowFor(mantra, previewIds.serious_sound_preview), undefined)
      const serious = await findExactMatchForSample(sampleIds.serious_sound_full_tempo092, THRESHOLD)
      assert.strictEqual(rowFor(serious, previewIds.mantra_preview), undefined)
    },

    'zero deviation reproduces the slope-1 scorer': async ({ sampleIds, previewIds }) => {
      const rows = await findExactMatchForSample(sampleIds.mantra_rec, THRESHOLD, { maxTempoDeviation: 0 })
      assert(rows.length > 0)
      for (const row of rows) assert.strictEqual(row.peak_tempo_factor, 1)
      const row = rowFor(rows, previewIds.mantra_preview)
      assert.strictEqual(
        row.match_score,
        slopeOnePeak(loadFingerprints('mantra_rec'), loadFingerprints('mantra_preview')),
      )
    },

    'in-memory fingerprints match like a stored sample': async ({ sampleIds }) => {
      const fps = loadFingerprints('mantra_full_speed108')
      const options = { threshold: THRESHOLD, bucketSeconds: BUCKET_SECONDS, peakBucketMin: 3, maxTempoDeviation: 0.08 }
      const stored = await matchFingerprints({ sampleId: sampleIds.mantra_full_speed108 }, options)
      const inMemory = await matchFingerprints(
        { hashes: fps.map((fp) => fp.hash), positions: fps.map((fp) => fp.position) },
        options,
      )
      assert.deepStrictEqual(inMemory.rows, stored.rows)
    },

    'synthetic 6 % speed-up is found at tempo factor 1.06': async ({ previewIds }) => {
      const preview = loadFingerprints('serious_sound_preview')
      const options = { threshold: THRESHOLD, bucketSeconds: BUCKET_SECONDS, peakBucketMin: 3, maxTempoDeviation: 0.08 }
      const original = await matchFingerprints(
        { hashes: preview.map((fp) => fp.hash), positions: preview.map((fp) => fp.position) },
        options,
      )
      const stretched = await matchFingerprints(
        { hashes: preview.map((fp) => fp.hash), positions: preview.map((fp) => fp.position / 1.06) },
        options,
      )
      const before = rowFor(original.rows, previewIds.serious_sound_preview)
      const after = rowFor(stretched.rows, previewIds.serious_sound_preview)
      assert(Math.abs(after.peak_tempo_factor - 1.06) <= 0.005, `tempo factor ${after.peak_tempo_factor}`)
      assert(after.match_score >= 0.95 * before.match_score, `${after.match_score} vs ${before.match_score}`)
    },
  },
})
