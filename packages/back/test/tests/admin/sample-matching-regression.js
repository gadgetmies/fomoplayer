const assert = require('assert')
const fs = require('fs')
const path = require('path')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')

const { findExactMatchForSample } = require('../../../routes/admin/db.js')

// Fixture fingerprints extracted offline from analyser/data/ via
// extract_panako_fingerprints; see analyser/README.md for the
// re-extraction procedure. Tests stay hermetic — Panako does not run.
const FIXTURE_DIR = path.join(__dirname, '../../fixtures/sample-matching')
const FIXTURES = [
  'mantra_full',
  'mantra_preview',
  'mantra_rec',
  'serious_sound_full',
  'serious_sound_preview',
  'serious_sound_rec',
]

const loadFingerprints = (name) => {
  const raw = fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')
  return JSON.parse(raw).fingerprints
}

// Stage 1 threshold for the binding requirements in
// openspec/changes/fix-sample-matching/specs/sample-matching/spec.md.
// Chosen so mantra_rec ↔ mantra_preview (ratio ≈ 0.013) surfaces while
// every cross-group pair (max ratio ≈ 0.005) does not.
const REGRESSION_THRESHOLD = 0.008

// Seed every fixture as BOTH a sample and a preview, returning the IDs
// keyed by fixture base name. Letting one fixture play both roles lets
// us query findExactMatchForSample with any fixture as the "sample"
// side and see every other fixture as a candidate.
const seedAllFixtures = async () => {
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
      INSERT INTO track (track_title) VALUES (${`fixture ${name}`}) RETURNING track_id
    `)
    trackIds.push(trackId)
    const [{ store__track_id: storeTrackId }] = await pg.queryRowsAsync(sql`
      INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
      VALUES (${trackId}, 1, ${`fp-regression-${name}`}, '{}')
      RETURNING store__track_id
    `)
    const [{ store__track_preview_id: previewId }] = await pg.queryRowsAsync(sql`
      INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
      VALUES (${storeTrackId}, ${`http://example.com/${name}.mp3`}, 'mp3')
      RETURNING store__track_preview_id
    `)
    previewIds[name] = previewId

    const [{ user_notification_audio_sample_id: sampleId }] = await pg.queryRowsAsync(sql`
      INSERT INTO user_notification_audio_sample
        (meta_account_user_id, user_notification_audio_sample_bucket_name,
         user_notification_audio_sample_object_key, user_notification_audio_sample_url,
         user_notification_audio_sample_file_size, user_notification_audio_sample_file_type)
      VALUES (${userId}, 'bucket', ${`object-${name}`}, ${`http://example.com/${name}.mp3`}, 100, 'audio/mp3')
      RETURNING user_notification_audio_sample_id
    `)
    sampleIds[name] = sampleId

    // Batch ~thousands of fingerprints per fixture via json_to_recordset
    // — single-row INSERTs blow past cascade-test's per-suite 10 s budget.
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

// Returns the rank of `expectedFixtureName` (1-indexed) in the match
// rows AFTER skipping `excludeFixtureName` (the row whose preview was
// seeded from the same source file as the sample being queried — a
// tautological 100% match the matcher would otherwise put at rank 1).
// Returns -1 if the fixture is not present in the filtered rows.
const rankOfFixture = (rows, previewIds, expectedFixtureName, excludeFixtureName) => {
  const excludeId = excludeFixtureName ? String(previewIds[excludeFixtureName]) : null
  const filtered = rows.filter((r) => String(r.store__track_preview_id) !== excludeId)
  const target = String(previewIds[expectedFixtureName])
  return filtered.findIndex((r) => String(r.store__track_preview_id) === target) + 1 || -1
}

test({
  setup: async () => {
    await initDb()
  },

  'findExactMatchForSample binding pairs (Decision 0 = scoring)': {
    setup: seedAllFixtures,
    teardown: cleanup,

    'mantra_rec returns mantra_full at rank 1 and mantra_preview at rank 2': async ({
      sampleIds,
      previewIds,
    }) => {
      const rows = await findExactMatchForSample(sampleIds.mantra_rec, REGRESSION_THRESHOLD)
      assert.ok(rows.length >= 2, `expected at least 2 matches, got ${rows.length}`)
      assert.strictEqual(
        rankOfFixture(rows, previewIds, 'mantra_full', 'mantra_rec'),
        1,
        'mantra_full should rank 1 for mantra_rec sample',
      )
      assert.strictEqual(
        rankOfFixture(rows, previewIds, 'mantra_preview', 'mantra_rec'),
        2,
        'mantra_preview should rank 2 for mantra_rec sample',
      )
    },

    'serious_sound_rec returns serious_sound_full at rank 1 and serious_sound_preview at rank 2': async ({
      sampleIds,
      previewIds,
    }) => {
      const rows = await findExactMatchForSample(sampleIds.serious_sound_rec, REGRESSION_THRESHOLD)
      assert.ok(rows.length >= 2, `expected at least 2 matches, got ${rows.length}`)
      assert.strictEqual(
        rankOfFixture(rows, previewIds, 'serious_sound_full', 'serious_sound_rec'),
        1,
        'serious_sound_full should rank 1 for serious_sound_rec sample',
      )
      assert.strictEqual(
        rankOfFixture(rows, previewIds, 'serious_sound_preview', 'serious_sound_rec'),
        2,
        'serious_sound_preview should rank 2 for serious_sound_rec sample',
      )
    },

    'mantra_full returns mantra_preview at rank 1': async ({ sampleIds, previewIds }) => {
      const rows = await findExactMatchForSample(sampleIds.mantra_full, REGRESSION_THRESHOLD)
      assert.ok(rows.length >= 1, `expected at least 1 match, got ${rows.length}`)
      assert.strictEqual(
        rankOfFixture(rows, previewIds, 'mantra_preview', 'mantra_full'),
        1,
        'mantra_preview should rank 1 for mantra_full sample',
      )
    },

    'serious_sound_full returns serious_sound_preview at rank 1': async ({
      sampleIds,
      previewIds,
    }) => {
      const rows = await findExactMatchForSample(sampleIds.serious_sound_full, REGRESSION_THRESHOLD)
      assert.ok(rows.length >= 1, `expected at least 1 match, got ${rows.length}`)
      assert.strictEqual(
        rankOfFixture(rows, previewIds, 'serious_sound_preview', 'serious_sound_full'),
        1,
        'serious_sound_preview should rank 1 for serious_sound_full sample',
      )
    },

    'cross-group: mantra_rec does not surface any serious_sound_* preview above threshold': async ({
      sampleIds,
      previewIds,
    }) => {
      const rows = await findExactMatchForSample(sampleIds.mantra_rec, REGRESSION_THRESHOLD)
      for (const name of ['serious_sound_full', 'serious_sound_preview', 'serious_sound_rec']) {
        assert.strictEqual(
          rankOfFixture(rows, previewIds, name, 'mantra_rec'),
          -1,
          `${name} should not surface for mantra_rec sample at threshold ${REGRESSION_THRESHOLD}`,
        )
      }
    },

    'cross-group: serious_sound_rec does not surface any mantra_* preview above threshold': async ({
      sampleIds,
      previewIds,
    }) => {
      const rows = await findExactMatchForSample(
        sampleIds.serious_sound_rec,
        REGRESSION_THRESHOLD,
      )
      for (const name of ['mantra_full', 'mantra_preview', 'mantra_rec']) {
        assert.strictEqual(
          rankOfFixture(rows, previewIds, name, 'serious_sound_rec'),
          -1,
          `${name} should not surface for serious_sound_rec sample at threshold ${REGRESSION_THRESHOLD}`,
        )
      }
    },
  },

  'findExactMatchForSample throws when neither explicit threshold nor SAMPLE_MATCH_DEFAULT_THRESHOLD is set': async () => {
    // Spec requirement: silent reliance on the old 0.5 default is
    // impossible. Setting process.env at runtime would not affect the
    // already-loaded config module, so we override the module-level
    // cached value for this single assertion and restore it after.
    const config = require('../../../config.js')
    const original = config.sampleMatchDefaultThreshold
    config.sampleMatchDefaultThreshold = undefined
    try {
      await assert.rejects(
        () => findExactMatchForSample(1, undefined, { log: { info: () => {} } }),
        (err) =>
          /SAMPLE_MATCH_DEFAULT_THRESHOLD/.test(err.message) &&
          /findExactMatchForSample/.test(err.message),
      )
    } finally {
      config.sampleMatchDefaultThreshold = original
    }
  },
})
