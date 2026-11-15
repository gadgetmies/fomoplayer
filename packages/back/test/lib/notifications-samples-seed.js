const sql = require('sql-template-strings')
const { EMBEDDING_TYPE } = require('../../routes/shared/db/cart-similarity')

// Seeding for the notifications-samples demo: three audio samples, listed newest first, so `matched` is first.
// The preview uploads them through the API (it has object storage, and the upload does not need a verified email).
// The local test server has no object storage, so the local demo inserts them through the DB, and also gives the
// matched sample a fingerprint match and an embedding, so Matches and Sounds like have rows.

const SAMPLES = {
  deletable: 'samples-demo-delete-me.mp3',
  other: 'samples-demo-vocal-chop.mp3',
  matched: 'samples-demo-pad-stab.mp3',
}
// Upload and insert order: the list is newest first
const SAMPLE_ORDER = [SAMPLES.deletable, SAMPLES.other, SAMPLES.matched]
const MATCH_OFFSET_SECONDS = 30
const EMBEDDING_DIMENSIONS = 1280

const listSamplesViaApi = (page) =>
  page.evaluate(async () => {
    const response = await fetch('/api/me/notifications/audio-samples', { credentials: 'same-origin' })
    if (!response.ok) throw new Error(`Listing audio samples failed: HTTP ${response.status}`)
    return response.json()
  })

// Both demos start by deleting the samples an earlier run left, so reruns against the persistent preview start clean
const removeDemoSamplesViaApi = async (page) => {
  const demoNames = Object.values(SAMPLES)
  const leftovers = (await listSamplesViaApi(page)).filter(({ filename }) => demoNames.includes(filename))
  for (const { id } of leftovers) {
    await page.evaluate(async (sampleId) => {
      const response = await fetch(`/api/me/notifications/audio-samples/${sampleId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      })
      if (!response.ok) throw new Error(`Deleting audio sample ${sampleId} failed: HTTP ${response.status}`)
    }, id)
  }
}

const idsByName = (samples) =>
  Object.fromEntries(
    Object.entries(SAMPLES).map(([key, filename]) => [key, samples.find((sample) => sample.filename === filename)?.id]),
  )

// Preview: uploads the three samples. Their audio is a few bytes: the demo does not play them.
const seedSamplesViaApi = async (page) => {
  await removeDemoSamplesViaApi(page)
  for (const filename of SAMPLE_ORDER) {
    await page.evaluate(async (name) => {
      const body = new FormData()
      body.append(
        'audioFile',
        new Blob([new Uint8Array([0x49, 0x44, 0x33, 3, 0, 0, 0, 0, 0, 0])], { type: 'audio/mpeg' }),
        name,
      )
      const response = await fetch('/api/me/notifications/audio-samples', {
        method: 'POST',
        credentials: 'same-origin',
        body,
      })
      if (!response.ok) throw new Error(`Uploading ${name} failed: HTTP ${response.status} ${await response.text()}`)
    }, filename)
  }
  return idsByName(await listSamplesViaApi(page))
}

const vector = (degrees) => {
  const values = new Array(EMBEDDING_DIMENSIONS).fill(0)
  values[0] = Math.cos((degrees * Math.PI) / 180)
  values[1] = Math.sin((degrees * Math.PI) / 180)
  return `[${values.join(',')}]`
}

// Local: inserts the three samples, a fingerprint match of the matched sample on the third one-player demo track, and
// embeddings that make the other two demo tracks sound like it. Builds on seedOnePlayerTracksViaApi.
const seedSamplesViaDb = async (page, userId) => {
  const { pg } = require('./db')
  await removeDemoSamplesViaApi(page)
  const tracks = await pg.queryRowsAsync(sql`
    SELECT track_id AS "trackId", store__track_preview_id AS "previewId", store__track_preview_url AS "previewUrl"
    FROM store__track NATURAL JOIN store__track_preview
    WHERE store__track_store_id IN ('990000101', '990000102', '990000103')
    ORDER BY store__track_store_id
  `)
  if (tracks.length !== 3) throw new Error(`Expected the three one-player demo tracks, found ${tracks.length}`)
  const [first, second, matched] = tracks

  const ids = {}
  for (const [index, filename] of SAMPLE_ORDER.entries()) {
    // The samples play the matched track's preview, with a URL fragment so each sample's URL differs from the match's
    const [{ id }] = await pg.queryRowsAsync(sql`
      INSERT INTO user_notification_audio_sample
        (meta_account_user_id, user_notification_audio_sample_bucket_name, user_notification_audio_sample_object_key,
         user_notification_audio_sample_url, user_notification_audio_sample_file_size,
         user_notification_audio_sample_file_type, user_notification_audio_sample_filename,
         user_notification_audio_sample_created_at)
      VALUES (${userId}, 'demo', ${`samples-demo-${userId}-${index}`}, ${`${matched.previewUrl}#sample=${index + 1}`}, 1,
              'audio/mpeg', ${filename}, NOW() - ${`${SAMPLE_ORDER.length - index} minutes`}::INTERVAL)
      RETURNING user_notification_audio_sample_id AS id
    `)
    ids[Object.keys(SAMPLES).find((key) => SAMPLES[key] === filename)] = id
  }

  await pg.queryAsync(sql`
    INSERT INTO user_notification_audio_sample_match
      (user_notification_audio_sample_id, store__track_preview_id, user_notification_audio_sample_match_score,
       user_notification_audio_sample_match_threshold, user_notification_audio_sample_match_bucket_seconds,
       user_notification_audio_sample_match_offset_seconds, user_notification_audio_sample_match_tempo_factor)
    VALUES (${ids.matched}, ${matched.previewId}, 12, 0.008, 0.5, ${MATCH_OFFSET_SECONDS}, 1.0)
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_notification_audio_sample_embedding
      (user_notification_audio_sample_id, user_notification_audio_sample_embedding,
       user_notification_audio_sample_embedding_type)
    VALUES (${ids.matched}, ${vector(0)}::VECTOR, ${EMBEDDING_TYPE})
  `)
  for (const [{ previewId }, degrees] of [
    [first, 10],
    [second, 20],
  ]) {
    await pg.queryAsync(sql`
      INSERT INTO store__track_preview_embedding
        (store__track_preview_id, store__track_preview_embedding, store__track_preview_embedding_type)
      VALUES (${previewId}, ${vector(degrees)}::VECTOR, ${EMBEDDING_TYPE})
      ON CONFLICT (store__track_preview_id, store__track_preview_embedding_type)
        DO UPDATE SET store__track_preview_embedding = EXCLUDED.store__track_preview_embedding
    `)
  }
  return ids
}

module.exports = { SAMPLES, seedSamplesViaApi, seedSamplesViaDb, removeDemoSamplesViaApi }
