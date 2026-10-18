const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')

const { persistSampleMatches } = require('../../../routes/admin/db.js')
const { notifySampleMatches } = require('../../../jobs/sample-match-notifications.js')

const RECIPIENT = 'sample-match-notifications@example.com'

const seed = async () => {
  const [{ meta_account_user_id: userId }] = await pg.queryRowsAsync(sql`
    INSERT INTO meta_account (meta_account_user_id) VALUES (DEFAULT)
    RETURNING meta_account_user_id
  `)
  await pg.queryAsync(sql`
    INSERT INTO meta_account_email
      (meta_account_user_id, meta_account_email_address, meta_account_email_verification_code, meta_account_email_verified)
    VALUES (${userId}, ${RECIPIENT}, gen_random_uuid(), TRUE)
  `)

  const [{ artist_id: artistId }] = await pg.queryRowsAsync(sql`
    INSERT INTO artist (artist_name) VALUES ('Sample Match Artist') RETURNING artist_id
  `)
  const trackIds = []
  const previewIds = []
  for (const name of ['first', 'second']) {
    const [{ track_id: trackId }] = await pg.queryRowsAsync(sql`
      INSERT INTO track (track_title) VALUES (${`sample-match ${name}`}) RETURNING track_id
    `)
    trackIds.push(trackId)
    await pg.queryAsync(sql`INSERT INTO track__artist (track_id, artist_id) VALUES (${trackId}, ${artistId})`)
    const [{ store__track_id: storeTrackId }] = await pg.queryRowsAsync(sql`
      INSERT INTO store__track (track_id, store_id, store__track_store_id)
      VALUES (${trackId}, 1, ${`sample-match-${name}`})
      RETURNING store__track_id
    `)
    const [{ store__track_preview_id: previewId }] = await pg.queryRowsAsync(sql`
      INSERT INTO store__track_preview (store__track_id, store__track_preview_url, store__track_preview_format)
      VALUES (${storeTrackId}, ${`http://example.com/sample-match-${name}.mp3`}, 'mp3')
      RETURNING store__track_preview_id
    `)
    previewIds.push(previewId)
  }

  const [{ user_notification_audio_sample_id: sampleId }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_notification_audio_sample
      (meta_account_user_id, user_notification_audio_sample_bucket_name,
       user_notification_audio_sample_object_key, user_notification_audio_sample_url,
       user_notification_audio_sample_file_size, user_notification_audio_sample_file_type,
       user_notification_audio_sample_filename)
    VALUES (${userId}, 'bucket', 'sample-match-object', 'http://example.com/sample.mp3', 100, 'audio/mp3', 'my-sample.mp3')
    RETURNING user_notification_audio_sample_id
  `)

  return { userId, sampleId, artistId, trackIds, previewIds }
}

const cleanup = async ({ userId, artistId, trackIds, previewIds }) => {
  await pg.queryAsync(sql`DELETE FROM email_queue WHERE email_queue_recipient = ${RECIPIENT}`)
  for (const previewId of previewIds) {
    await pg.queryAsync(sql`DELETE FROM store__track_preview WHERE store__track_preview_id = ${previewId}`)
  }
  for (const trackId of trackIds) {
    await pg.queryAsync(sql`DELETE FROM track__artist WHERE track_id = ${trackId}`)
    await pg.queryAsync(sql`DELETE FROM track WHERE track_id = ${trackId}`)
  }
  await pg.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${artistId}`)
  await pg.queryAsync(sql`DELETE FROM user_notification_audio_sample WHERE meta_account_user_id = ${userId}`)
  await pg.queryAsync(sql`DELETE FROM meta_account_email WHERE meta_account_user_id = ${userId}`)
  await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userId}`)
}

const matchRows = async (sampleId) =>
  pg.queryRowsAsync(sql`
    SELECT store__track_preview_id                          AS "previewId",
           user_notification_audio_sample_match_score       AS score,
           user_notification_audio_sample_match_matched_at  AS "matchedAt",
           user_notification_audio_sample_match_notified_at AS "notifiedAt"
    FROM user_notification_audio_sample_match
    WHERE user_notification_audio_sample_id = ${sampleId}
    ORDER BY store__track_preview_id
  `)

const queuedEmails = async () =>
  pg.queryRowsAsync(sql`
    SELECT email_queue_subject AS subject, email_queue_plain AS plain, email_queue_category AS category
    FROM email_queue
    WHERE email_queue_recipient = ${RECIPIENT}
    ORDER BY email_queue_id
  `)

const match = (previewId, score, offset = null, tempo = null) => ({
  store__track_preview_id: previewId,
  match_score: score,
  peak_offset_seconds: offset,
  peak_tempo_factor: tempo,
})

const offsetTempoRows = async (sampleId) =>
  pg.queryRowsAsync(sql`
    SELECT store__track_preview_id                             AS "previewId",
           user_notification_audio_sample_match_offset_seconds AS "offsetSeconds",
           user_notification_audio_sample_match_tempo_factor   AS "tempoFactor"
    FROM user_notification_audio_sample_match
    WHERE user_notification_audio_sample_id = ${sampleId}
    ORDER BY store__track_preview_id
  `)

const eventRows = async (sampleId) =>
  pg.queryRowsAsync(sql`
    SELECT user_notification_event_id       AS id,
           meta_account_user_id             AS "userId",
           track_id                         AS "trackId",
           store__track_preview_id          AS "previewId",
           user_notification_event_read_at  AS "readAt"
    FROM user_notification_event
    WHERE user_notification_audio_sample_id = ${sampleId}
    ORDER BY store__track_preview_id
  `)

test({
  setup: async () => {
    await initDb()
  },

  persistSampleMatches: {
    setup: seed,
    teardown: cleanup,

    'updates existing pairs in place, keeping matched_at and notified_at': async ({ sampleId, previewIds }) => {
      await persistSampleMatches(sampleId, [match(previewIds[0], 5)], 0.01, 0.05)
      await pg.queryAsync(sql`
        UPDATE user_notification_audio_sample_match
        SET user_notification_audio_sample_match_notified_at = NOW()
        WHERE user_notification_audio_sample_id = ${sampleId}
      `)
      const [before] = await matchRows(sampleId)

      await persistSampleMatches(sampleId, [match(previewIds[0], 9), match(previewIds[1], 3)], 0.02, 0.05)
      const [updated, inserted] = await matchRows(sampleId)

      assert.strictEqual(updated.score, 9)
      assert.deepStrictEqual(updated.matchedAt, before.matchedAt)
      assert.deepStrictEqual(updated.notifiedAt, before.notifiedAt)
      assert.strictEqual(inserted.previewId, previewIds[1])
      assert.strictEqual(inserted.notifiedAt, null)
    },

    'stores the matcher offset and tempo and updates them on rescore': async ({ sampleId, previewIds }) => {
      await persistSampleMatches(sampleId, [match(previewIds[0], 5, 12.5, 1.02)], 0.01, 0.5)
      assert.deepStrictEqual(await offsetTempoRows(sampleId), [
        { previewId: previewIds[0], offsetSeconds: 12.5, tempoFactor: 1.02 },
      ])

      await persistSampleMatches(sampleId, [match(previewIds[0], 6, 13, 0.97), match(previewIds[1], 4)], 0.01, 0.5)
      assert.deepStrictEqual(await offsetTempoRows(sampleId), [
        { previewId: previewIds[0], offsetSeconds: 13, tempoFactor: 0.97 },
        { previewId: previewIds[1], offsetSeconds: null, tempoFactor: null },
      ])
    },

    'records one unread event per new match for the sample owner': async ({ userId, sampleId, previewIds, trackIds }) => {
      await persistSampleMatches(sampleId, [match(previewIds[0], 5)], 0.01, 0.5)
      const [first] = await eventRows(sampleId)
      assert.deepStrictEqual(
        { userId: first.userId, trackId: first.trackId, previewId: first.previewId, readAt: first.readAt },
        { userId, trackId: trackIds[0], previewId: previewIds[0], readAt: null },
      )

      await pg.queryAsync(sql`UPDATE user_notification_event SET user_notification_event_read_at = NOW() WHERE user_notification_event_id = ${first.id}`)
      // Rescoring the existing match keeps its event (and read state); the new match gets its own.
      await persistSampleMatches(sampleId, [match(previewIds[0], 7), match(previewIds[1], 4)], 0.01, 0.5)
      const events = await eventRows(sampleId)
      assert.strictEqual(events.length, 2)
      assert.strictEqual(events[0].id, first.id)
      assert.ok(events[0].readAt)
      assert.strictEqual(events[1].trackId, trackIds[1])
      assert.strictEqual(events[1].readAt, null)

      // A match the rescore drops takes its event with it.
      await persistSampleMatches(sampleId, [match(previewIds[1], 4)], 0.01, 0.5)
      assert.deepStrictEqual((await eventRows(sampleId)).map(({ previewId }) => previewId), [previewIds[1]])
    },

    'removes pairs missing from the new result set': async ({ sampleId, previewIds }) => {
      await persistSampleMatches(sampleId, [match(previewIds[0], 5), match(previewIds[1], 4)], 0.01, 0.05)
      await persistSampleMatches(sampleId, [match(previewIds[1], 4)], 0.01, 0.05)
      assert.deepStrictEqual(
        (await matchRows(sampleId)).map(({ previewId }) => previewId),
        [previewIds[1]],
      )

      await persistSampleMatches(sampleId, [], 0.01, 0.05)
      assert.strictEqual((await matchRows(sampleId)).length, 0)
    },
  },

  notifySampleMatches: {
    setup: seed,
    teardown: cleanup,

    'emails new matches once and only emails pairs found later': async ({ sampleId, previewIds }) => {
      await persistSampleMatches(sampleId, [match(previewIds[0], 5)], 0.01, 0.05)

      assert.deepStrictEqual(await notifySampleMatches(), { success: true })
      let emails = await queuedEmails()
      assert.strictEqual(emails.length, 1)
      assert.strictEqual(emails[0].category, 'notification')
      assert.match(emails[0].subject, /my-sample\.mp3/)
      assert.match(emails[0].plain, /sample-match first/)
      assert.match(emails[0].plain, new RegExp(`sample%3A~${sampleId}`))
      assert.ok((await matchRows(sampleId))[0].notifiedAt)

      // Re-scoring with the same match must not send another email.
      await persistSampleMatches(sampleId, [match(previewIds[0], 6)], 0.01, 0.05)
      await notifySampleMatches()
      assert.strictEqual((await queuedEmails()).length, 1)

      // A newly recognised track triggers an email listing only that track.
      await persistSampleMatches(sampleId, [match(previewIds[0], 6), match(previewIds[1], 4)], 0.01, 0.05)
      await notifySampleMatches()
      emails = await queuedEmails()
      assert.strictEqual(emails.length, 2)
      assert.match(emails[1].plain, /sample-match second/)
      assert.doesNotMatch(emails[1].plain, /sample-match first/)
    },
  },

  'notifySampleMatches with an unverified email': {
    setup: seed,
    teardown: cleanup,

    'leaves matches pending while the email is unverified': async ({ userId, sampleId, previewIds }) => {
      await pg.queryAsync(sql`
        UPDATE meta_account_email SET meta_account_email_verified = FALSE WHERE meta_account_user_id = ${userId}
      `)
      await persistSampleMatches(sampleId, [match(previewIds[0], 5)], 0.01, 0.05)
      await notifySampleMatches()

      assert.strictEqual((await queuedEmails()).length, 0)
      assert.strictEqual((await matchRows(sampleId))[0].notifiedAt, null)
    },
  },
})
