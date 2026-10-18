const sql = require('sql-template-strings')

// DB seeding for the local notifications-page demo. Notification events are only written by the notification jobs,
// which a demo cannot trigger on the preview, so the local demo inserts them directly: two search-subscription events
// and a sample match with a stored offset and tempo. Builds on the tracks seeded by seedOnePlayerTracksViaApi.

const SAMPLE_FILENAME = 'notifications-demo-sample.mp3'
const SAMPLE_MATCH_OFFSET_SECONDS = 30

const seedNotificationEventsViaDb = async (userId) => {
  const { pg } = require('./db')
  const tracks = await pg.queryRowsAsync(sql`
    SELECT track_id AS "trackId", store__track_preview_id AS "previewId", store__track_preview_url AS "previewUrl"
    FROM store__track NATURAL JOIN store__track_preview
    WHERE store__track_store_id IN ('990000101', '990000102', '990000103')
    ORDER BY store__track_store_id
  `)
  if (tracks.length !== 3) throw new Error(`Expected the three one-player demo tracks, found ${tracks.length}`)
  const [first, second, matched] = tracks

  await pg.queryAsync(sql`DELETE FROM user_notification_event WHERE meta_account_user_id = ${userId}`)
  const [{ id: notificationId }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_search_notification (meta_account_user_id, user_search_notification_string)
    VALUES (${userId}, 'one player demo')
    ON CONFLICT ON CONSTRAINT user_search_notification_meta_account_user_id_user_search_n_key
      DO UPDATE SET meta_account_user_id = EXCLUDED.meta_account_user_id
    RETURNING user_search_notification_id AS id
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_search_notification__store (user_search_notification_id, store_id)
    SELECT ${notificationId}, store_id FROM store WHERE store_name = 'Beatport'
    ON CONFLICT DO NOTHING
  `)
  for (const { trackId } of [first, second]) {
    await pg.queryAsync(sql`
      INSERT INTO user_notification_event (meta_account_user_id, track_id, user_search_notification_id)
      VALUES (${userId}, ${trackId}, ${notificationId})
    `)
  }

  // The sample is the matched track's own preview (with a URL fragment, so A and B are different sources; the CDN rejects query strings)
  await pg.queryAsync(sql`
    DELETE FROM user_notification_audio_sample
    WHERE meta_account_user_id = ${userId} AND user_notification_audio_sample_filename = ${SAMPLE_FILENAME}
  `)
  const [{ id: sampleId }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_notification_audio_sample
      (meta_account_user_id, user_notification_audio_sample_bucket_name, user_notification_audio_sample_object_key,
       user_notification_audio_sample_url, user_notification_audio_sample_file_size,
       user_notification_audio_sample_file_type, user_notification_audio_sample_filename)
    VALUES (${userId}, 'demo', ${`notifications-demo-${userId}`}, ${`${matched.previewUrl}#sample=1`}, 1, 'audio/mpeg',
            ${SAMPLE_FILENAME})
    RETURNING user_notification_audio_sample_id AS id
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_notification_audio_sample_match
      (user_notification_audio_sample_id, store__track_preview_id, user_notification_audio_sample_match_score,
       user_notification_audio_sample_match_threshold, user_notification_audio_sample_match_bucket_seconds,
       user_notification_audio_sample_match_offset_seconds, user_notification_audio_sample_match_tempo_factor)
    VALUES (${sampleId}, ${matched.previewId}, 12, 0.008, 0.5, ${SAMPLE_MATCH_OFFSET_SECONDS}, 1.0)
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_notification_event
      (meta_account_user_id, track_id, user_notification_audio_sample_id, store__track_preview_id)
    VALUES (${userId}, ${matched.trackId}, ${sampleId}, ${matched.previewId})
  `)
  return { unreadCount: 3 }
}

module.exports = { seedNotificationEventsViaDb, SAMPLE_FILENAME, SAMPLE_MATCH_OFFSET_SECONDS }
