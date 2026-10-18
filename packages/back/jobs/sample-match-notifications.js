const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const R = require('ramda')
const { getTracksWithIds } = require('../routes/users/db')
const { scheduleEmail } = require('../services/mailer')
const { renderSampleMatchNotification } = require('../services/email-templates')
const { frontendURL } = require('../config')

const logger = require('fomoplayer_shared').logger(__filename)

// Tracks listed per sample in the email; the button links to the full list.
const MAX_TRACKS_PER_SAMPLE = 10

const formatTrack = ({ artists, title, version }) =>
  `${artists.map(({ name }) => name).join(', ')} - ${title}${version ? ` (${version})` : ''}`

// Email each user about fingerprint matches recorded since the last run, then
// stamp the notified rows so the next run skips them. Matches of users without
// a verified email stay pending until they verify.
module.exports.notifySampleMatches = async () => {
  const pending = await getPendingMatches()
  const errors = []

  for (const userMatches of R.values(R.groupBy(R.prop('userId'), pending))) {
    const { userId, email } = userMatches[0]
    try {
      const trackDetails = await getTracksWithIds(R.uniq(userMatches.map(R.prop('trackId'))))
      const trackById = R.indexBy(({ track_id }) => String(track_id), trackDetails)

      const samples = R.values(R.groupBy(R.prop('sampleId'), userMatches)).map((sampleMatches) => {
        const { sampleId, filename } = sampleMatches[0]
        const tracks = R.uniq(sampleMatches.map(({ trackId }) => String(trackId)))
          .map((trackId) => trackById[trackId])
          .filter(Boolean)
          .slice(0, MAX_TRACKS_PER_SAMPLE)
          .map(formatTrack)
        return {
          name: filename || `Sample ${sampleId}`,
          tracks,
          searchUrl: `${frontendURL}/search/?q=${encodeURIComponent(`sample:~${sampleId}`)}`,
        }
      })

      if (samples.some(({ tracks }) => tracks.length > 0)) {
        logger.info(`Scheduling sample match notification email for user id: ${userId}`)
        const { subject, contentHtml, text, category } = renderSampleMatchNotification({
          samples: samples.filter(({ tracks }) => tracks.length > 0),
        })
        await scheduleEmail(process.env.NOTIFICATION_EMAIL_SENDER, email, subject, text, contentHtml, category)
      }

      await markNotified(userMatches)
    } catch (e) {
      logger.error('Failed to notify sample matches', { userId, error: e.message, stack: e.stack })
      errors.push(e.toString())
    }
  }

  if (errors.length === 0) {
    return { success: true }
  } else {
    return { success: false, result: errors }
  }
}

const getPendingMatches = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getPendingSampleMatches
SELECT meta_account_user_id                    AS "userId",
       meta_account_email_address              AS email,
       user_notification_audio_sample_id       AS "sampleId",
       user_notification_audio_sample_filename AS filename,
       store__track_preview_id                 AS "previewId",
       track_id                                AS "trackId"
FROM user_notification_audio_sample_match
         NATURAL JOIN user_notification_audio_sample
         NATURAL JOIN meta_account_email
         NATURAL JOIN store__track_preview
         NATURAL JOIN store__track
WHERE user_notification_audio_sample_match_notified_at IS NULL
  AND meta_account_email_verified
ORDER BY meta_account_user_id,
         user_notification_audio_sample_id,
         user_notification_audio_sample_match_score DESC
`,
  )

const markNotified = async (matches) =>
  pg.queryAsync(
    // language=PostgreSQL
    sql`-- markSampleMatchesNotified
UPDATE user_notification_audio_sample_match m
SET user_notification_audio_sample_match_notified_at = NOW()
FROM json_to_recordset(${JSON.stringify(
      matches.map(({ sampleId, previewId }) => ({ sample_id: String(sampleId), preview_id: String(previewId) })),
    )}::json) AS rec (sample_id TEXT, preview_id TEXT)
WHERE m.user_notification_audio_sample_id = rec.sample_id::BIGINT
  AND m.store__track_preview_id = rec.preview_id::BIGINT
  AND m.user_notification_audio_sample_match_notified_at IS NULL
`,
  )
