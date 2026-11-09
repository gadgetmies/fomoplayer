const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const { queryTrackDetails } = require('./cart-similarity')

// Tracks in the track-list shape, keyed by track id, for attaching to events and matches.
const trackDetailsById = async (userId, trackIds) => {
  const details = await queryTrackDetails(userId, [...new Set(trackIds)])
  return new Map(details.map((track) => [track.id, track]))
}

// The caller's notification events, newest first. `before` is the id of the last event of the previous page.
module.exports.queryNotificationEvents = async (userId, { limit, before }) => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryNotificationEvents
SELECT e.user_notification_event_id                 AS id
     , e.user_notification_event_created_at         AS "createdAt"
     , e.user_notification_event_read_at IS NOT NULL AS read
     , e.track_id                                   AS "trackId"
     , e.user_search_notification_id                AS "notificationId"
     , n.user_search_notification_string            AS "searchText"
     , COALESCE(a.artist_name, l.label_name, n.user_search_notification_string) AS "displayName"
     , e.user_notification_audio_sample_id          AS "sampleId"
     , s.user_notification_audio_sample_filename    AS filename
FROM user_notification_event e
       LEFT JOIN user_search_notification n USING (user_search_notification_id)
       LEFT JOIN artist a ON a.artist_id = CASE
                                              WHEN n.user_search_notification_string ~ '^artist:\\d+$'
                                                THEN SUBSTRING(n.user_search_notification_string FROM 8)::INT
                                            END
       LEFT JOIN label l ON l.label_id = CASE
                                           WHEN n.user_search_notification_string ~ '^label:\\d+$'
                                             THEN SUBSTRING(n.user_search_notification_string FROM 7)::INT
                                         END
       LEFT JOIN user_notification_audio_sample s USING (user_notification_audio_sample_id)
WHERE e.meta_account_user_id = ${userId}
  AND (${before}::INT IS NULL OR e.user_notification_event_id < ${before}::INT)
ORDER BY e.user_notification_event_id DESC
LIMIT ${limit}`,
  )
  const tracks = await trackDetailsById(
    userId,
    rows.map(({ trackId }) => trackId),
  )
  return rows.map(({ id, createdAt, read, trackId, notificationId, searchText, displayName, sampleId, filename }) => ({
    id,
    createdAt,
    read,
    reason: sampleId
      ? { type: 'sample', sampleId, filename }
      : { type: 'search', notificationId, text: searchText, displayName },
    track: tracks.get(trackId) ?? null,
  }))
}

module.exports.queryUnreadNotificationCount = async (userId) => {
  const [{ count }] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUnreadNotificationCount
SELECT COUNT(*)::INT AS count
FROM user_notification_event
WHERE meta_account_user_id = ${userId}
  AND user_notification_event_read_at IS NULL`,
  )
  return count
}

// Marks the caller's unread events read: all of them, or those for the given tracks. Returns how many were marked.
module.exports.markNotificationEventsRead = async (userId, { all, trackIds }) => {
  const result = await pg.queryAsync(
    // language=PostgreSQL
    sql`-- markNotificationEventsRead
UPDATE user_notification_event
SET user_notification_event_read_at = NOW()
WHERE meta_account_user_id = ${userId}
  AND user_notification_event_read_at IS NULL
  AND (${Boolean(all)} OR track_id = ANY (${trackIds ?? []}::INT[]))`,
  )
  return result.rowCount
}

// The caller's audio sample, or undefined when it does not exist or belongs to someone else.
module.exports.queryUserAudioSample = async (userId, sampleId) => {
  const [sample] = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- queryUserAudioSample
SELECT user_notification_audio_sample_id       AS id
     , user_notification_audio_sample_filename AS filename
FROM user_notification_audio_sample
WHERE user_notification_audio_sample_id = ${sampleId}
  AND meta_account_user_id = ${userId}`,
  )
  return sample
}

// A sample's fingerprint matches, highest score first, with where the sample sits in the preview, at which tempo, and
// whether the match's notification is still unread.
module.exports.querySampleMatches = async (userId, sampleId) => {
  const rows = await pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- querySampleMatches
SELECT track_id                                            AS "trackId"
     , store__track_preview_id                             AS "previewId"
     , user_notification_audio_sample_match_score          AS score
     , user_notification_audio_sample_match_offset_seconds AS "offsetSeconds"
     , user_notification_audio_sample_match_tempo_factor   AS "tempoFactor"
     , user_notification_audio_sample_match_matched_at     AS "matchedAt"
     , EXISTS (SELECT 1
               FROM user_notification_event e
               WHERE e.user_notification_audio_sample_id = m.user_notification_audio_sample_id
                 AND e.store__track_preview_id = m.store__track_preview_id
                 AND e.meta_account_user_id = ${userId}
                 AND e.user_notification_event_read_at IS NULL) AS unread
FROM user_notification_audio_sample_match m
       NATURAL JOIN store__track_preview
       NATURAL JOIN store__track
WHERE m.user_notification_audio_sample_id = ${sampleId}
ORDER BY user_notification_audio_sample_match_score DESC, store__track_preview_id`,
  )
  const tracks = await trackDetailsById(
    userId,
    rows.map(({ trackId }) => trackId),
  )
  return rows
    .filter(({ trackId }) => tracks.has(trackId))
    .map(({ trackId, previewId, score, offsetSeconds, tempoFactor, matchedAt, unread }) => ({
      ...tracks.get(trackId),
      match: { previewId, score, offsetSeconds, tempoFactor, matchedAt },
      unread,
    }))
}
