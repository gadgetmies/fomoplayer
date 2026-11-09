const pg = require('fomoplayer_shared').db.pg
const sql = require('sql-template-strings')
const R = require('ramda')
const { getTracksWithIds } = require('../routes/users/db')
const { searchForTracks } = require('../routes/shared/db/search')
const BPromise = require('bluebird')
const { scheduleEmail } = require('../services/mailer')
const { renderNotification } = require('../services/email-templates')
const { queryEntityDetails } = require('../routes/shared/db/entities')
const { frontendURL } = require('../config')

const logger = require('fomoplayer_shared').logger(__filename)

module.exports.updateNotifications = async () => {
  const notificationSearches = await getNotificationDetails()
  const errors = []

  for (const { userId, notificationId, text, email, emailVerified, lastUpdate, storeIds, storeNames } of notificationSearches) {
    let followText = text
    try {
      const searchResults = await searchForTracks(text, {
        userId,
        limit: 50,
        sort: '-added',
        addedSince: lastUpdate,
        storeIds,
      })

      const entityDetailsMatch = text.match(/(.+):(\d+)/)

      if (entityDetailsMatch) {
        const [_, entityType, entityId] = entityDetailsMatch
        logger.info(`Querying entity details for ${entityType}:${entityId}`)
        const { name } = await queryEntityDetails(entityType, entityId)
        followText = `${entityType}: "${name}"`
      }

      const uriEncoded = encodeURIComponent(text)

      logger.debug('Found tracks for search', { searchResults })

      await BPromise.using(pg.getTransaction(), async (tx) => {
        if (searchResults.length !== 0) {
          await insertSearchNotificationEvents(tx, userId, notificationId, searchResults.map(R.prop('track_id')))
        }

        if (searchResults.length !== 0 && emailVerified) {
          logger.info(`Scheduling notification update email for notification id: ${notificationId}`)
          const trackDetails = await getTracksWithIds(searchResults.map(R.prop('track_id')))
          const root = frontendURL
          const newTracksDetails = trackDetails.map(
            ({ artists, title, version }) =>
              `${artists.map(({ name }) => name).join(', ')} - ${title}${version ? ` (${version})` : ''}`,
          )
          const searchUrl = `${root}/search/?q=${uriEncoded}&sort=-added`
          const from = `(from ${R.init(storeNames).join(', ')}${
            storeNames.length > 1 ? ` or ${R.last(storeNames)}` : ''
          })`
          const { subject, contentHtml, text, category } = renderNotification({
            searchText: followText,
            tracks: newTracksDetails,
            searchUrl,
            fromStores: from,
          })
          await scheduleEmail(process.env.NOTIFICATION_EMAIL_SENDER, email, subject, text, contentHtml, category)
        }

        await tx.queryAsync(
          // language=PostgreSQL
          sql`--update notification update time
UPDATE user_search_notification
SET user_search_notification_last_update = NOW()
WHERE user_search_notification_id = ${notificationId}
          `,
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

// One unread event per found track; the unique index makes re-processing the
// same window a no-op.
const insertSearchNotificationEvents = (tx, userId, notificationId, trackIds) =>
  tx.queryAsync(
    // language=PostgreSQL
    sql`-- insertSearchNotificationEvents
INSERT INTO user_notification_event (meta_account_user_id, track_id, user_search_notification_id)
SELECT ${userId}, track_id, ${notificationId}
FROM UNNEST(${trackIds}::INT[]) AS t(track_id)
ON CONFLICT DO NOTHING
`,
  )

// Subscriptions are processed whether or not the owner has a verified email:
// every owner gets notification events in the app, only verified owners get
// the email.
const getNotificationDetails = async () =>
  pg.queryRowsAsync(
    // language=PostgreSQL
    sql`-- getNotificationDetails
SELECT meta_account_user_id                  AS "userId",
       user_search_notification_id           AS "notificationId",
       user_search_notification_string       AS text,
       meta_account_email_address            AS email,
       COALESCE(meta_account_email_verified, FALSE) AS "emailVerified",
       user_search_notification_last_update  AS "lastUpdate",
       ARRAY_AGG(store_id)                   AS "storeIds",
       ARRAY_AGG(store_name)                 AS "storeNames"
FROM user_search_notification
         NATURAL LEFT JOIN meta_account_email
         NATURAL JOIN user_search_notification__store
         NATURAL JOIN store
WHERE (
    user_search_notification_last_update + INTERVAL '6 hours' < NOW()
  )
GROUP BY 1, 2, 3, 4, 5, 6
ORDER BY user_search_notification_last_update DESC NULLS FIRST
LIMIT 20
`,
  )
