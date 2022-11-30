const pg = require('../db/pg.js')
const sql = require('sql-template-strings')
const R = require('ramda')
const { updateNotificationTracks } = require('../routes/users/db')
const { searchForTracks } = require('../routes/shared/db/search')
const { using } = require('bluebird')
const { scheduleEmail } = require('../services/mailer')

const logger = require('../logger')(__filename)

module.exports.updateNotifications = async () => {
  const notificationSearches = await getNotificationDetails()
  const errors = []

  for (const { notificationId, text, userId, email, trackIds } of notificationSearches) {
    try {
      const searchResults = await searchForTracks(text, userId)
      const currentTrackIds = searchResults.map(R.prop('track_id'))
      const newTracks = R.without(trackIds, currentTrackIds)
      const uriEncoded = encodeURI(text)

      await using(pg.getTransaction(), async tx => {
        if (newTracks.length !== 0) {
          logger.info(`Scheduling notification update email for notification id: ${notificationId}`)
          await updateNotificationTracks(tx, notificationId, currentTrackIds)
          await scheduleEmail(
            process.env.NOTIFICATION_EMAIL_SENDER,
            email,
            `New results for your search '${text}'!`,
            `Check out the results at https://fomoplayer.com/search/?q=${uriEncoded}
`,
            `<h1>New results for your search '${text}'!</h1>
<a href="https://fomoplayer.com/search/?q=${uriEncoded}">
  Check out the results at https://fomoplayer.com/search/?q=${uriEncoded}
</a>`
          )
        }

        await tx.queryAsync(
          // language=PostgreSQL
          sql`--update notification update time
UPDATE user_search_notification
SET user_search_notification_last_update = NOW()
          `
        )
      })
    } catch (e) {
      errors.push(e.toString())
    }
  }

  if (errors.length === 0) {
    return { success: true }
  } else {
    return { success: false, result: errors }
  }
}

const getNotificationDetails = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getNotificationDetails
SELECT meta_account_user_id                  AS "userId",
       user_search_notification_id           AS "notificationId",
       user_search_notification_string       AS text,
       meta_account_email_address            AS email,
       user_search_notification_tracks       AS "trackIds"
FROM user_search_notification
         NATURAL JOIN meta_account_email
WHERE (
    user_search_notification_last_update IS NULL
    OR user_search_notification_last_update + INTERVAL '6 hours' < NOW()
  )
  AND meta_account_email_verified
ORDER BY user_search_notification_last_update DESC NULLS FIRST
LIMIT 20
`
  )
