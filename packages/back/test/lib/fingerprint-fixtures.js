const fs = require('fs')
const path = require('path')
const sql = require('sql-template-strings')
const { pg } = require('./db.js')

// Panako fingerprints extracted offline from analyser/data/ (see
// analyser/README.md, "Fixture fingerprint re-extraction"); tests stay
// hermetic because Panako does not run.
const FIXTURE_DIR = path.join(__dirname, '../fixtures/sample-matching')

module.exports.loadFingerprints = (name) =>
  JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, `${name}.json`), 'utf8')).fingerprints

const insertPayload = (fingerprints) =>
  JSON.stringify(fingerprints.map((fp) => ({ hash: String(fp.hash), position: fp.position, f1: fp.f1 ?? null })))

module.exports.createUser = async () => {
  const [{ meta_account_user_id: userId }] = await pg.queryRowsAsync(sql`
    INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT)
    RETURNING meta_account_user_id
  `)
  return userId
}

// A track with one preview holding `fingerprints`. Returns the ids.
module.exports.seedPreview = async (name, fingerprints) => {
  const [{ track_id: trackId }] = await pg.queryRowsAsync(sql`
    INSERT INTO track (track_title) VALUES (${`fixture ${name}`}) RETURNING track_id
  `)
  const [{ store__track_id: storeTrackId }] = await pg.queryRowsAsync(sql`
    INSERT INTO store__track (track_id, store_id, store__track_store_id)
    VALUES (${trackId}, 1, ${`fp-fixture-${name}-${trackId}`})
    RETURNING store__track_id
  `)
  const [{ store__track_preview_id: previewId }] = await pg.queryRowsAsync(sql`
    INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
    VALUES (${storeTrackId}, ${`http://example.com/${name}.mp3`}, 'mp3')
    RETURNING store__track_preview_id
  `)
  await pg.queryAsync(sql`
    INSERT INTO store__track_preview_fingerprint
      (store__track_preview_id, store__track_preview_fingerprint_hash,
       store__track_preview_fingerprint_position, store__track_preview_fingerprint_frequency_bin)
    SELECT ${previewId}::BIGINT, rec.hash::BIGINT, rec.position::FLOAT, rec.f1
    FROM json_to_recordset(${insertPayload(fingerprints)}::json) AS rec (hash TEXT, position FLOAT, f1 INTEGER)
  `)
  return { trackId, previewId }
}

// A user audio sample holding `fingerprints`. Returns its id.
module.exports.seedSample = async (userId, name, fingerprints) => {
  const [{ user_notification_audio_sample_id: sampleId }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_notification_audio_sample
      (meta_account_user_id, user_notification_audio_sample_bucket_name,
       user_notification_audio_sample_object_key, user_notification_audio_sample_url,
       user_notification_audio_sample_file_size, user_notification_audio_sample_file_type)
    VALUES (${userId}, 'bucket', ${`object-${name}`}, ${`http://example.com/${name}.mp3`}, 100, 'audio/mp3')
    RETURNING user_notification_audio_sample_id
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_notification_audio_sample_fingerprint
      (user_notification_audio_sample_id, user_notification_audio_sample_fingerprint_hash,
       user_notification_audio_sample_fingerprint_position, user_notification_audio_sample_fingerprint_frequency_bin)
    SELECT ${sampleId}::BIGINT, rec.hash::BIGINT, rec.position::FLOAT, rec.f1
    FROM json_to_recordset(${insertPayload(fingerprints)}::json) AS rec (hash TEXT, position FLOAT, f1 INTEGER)
  `)
  return sampleId
}

module.exports.removeSeeded = async ({ userId, trackIds }) => {
  for (const trackId of trackIds) {
    await pg.queryAsync(sql`
      DELETE FROM store__track_preview
      WHERE store__track_id IN (SELECT store__track_id FROM store__track WHERE track_id = ${trackId})
    `)
    await pg.queryAsync(sql`DELETE FROM track WHERE track_id = ${trackId}`)
  }
  await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userId}`)
}
