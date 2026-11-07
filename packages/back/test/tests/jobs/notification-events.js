const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addBandcampTracks, teardownTracks } = require('../../lib/tracks')

const { updateNotifications } = require('../../../jobs/notifications.js')

// The search-notification job records a notification event per found track for every subscriber and emails only
// subscribers with a verified address.

const SEARCH_TEXT = 'zqxnotifyevents'
const VERIFIED_EMAIL = 'notification-events-verified@example.com'

const bandcampTrack = (index) => ({
  id: String(930000100 + index),
  url: `https://example.bandcamp.com/track/notification-events-${index}`,
  title: `${SEARCH_TEXT} track ${index}`,
  version: null,
  duration_ms: 180000,
  released: '2026-04-01T12:00:00Z',
  published: '2026-04-01T12:00:00Z',
  track_number: 1,
  isrc: null,
  artists: [
    {
      name: `${SEARCH_TEXT} artist ${index}`,
      role: 'author',
      id: `notification-events-artist-${index}`,
      url: `https://notification-events-${index}.bandcamp.com`,
    },
  ],
  release: {
    id: `notification-events-release-${index}`,
    url: `https://example.bandcamp.com/album/notification-events-${index}`,
    title: `notification events release ${index}`,
    release_date: '2026-04-01T12:00:00Z',
    catalog_number: null,
    isrc: null,
  },
  previews: [
    {
      format: 'mp3',
      url: `https://example.bandcamp.com/preview/notification-events-${index}.mp3`,
      start_ms: 0,
      end_ms: 180000,
    },
  ],
})

const createUser = async (email) => {
  const [{ id }] = await pg.queryRowsAsync(
    sql`INSERT INTO meta_account DEFAULT VALUES RETURNING meta_account_user_id AS id`,
  )
  if (email) {
    await pg.queryAsync(sql`
      INSERT INTO meta_account_email
        (meta_account_user_id, meta_account_email_address, meta_account_email_verification_code, meta_account_email_verified)
      VALUES (${id}, ${email}, gen_random_uuid(), TRUE)
    `)
  }
  return id
}

const subscribe = async (userId) => {
  const [{ id }] = await pg.queryRowsAsync(sql`
    INSERT INTO user_search_notification
      (meta_account_user_id, user_search_notification_string, user_search_notification_last_update)
    VALUES (${userId}, ${SEARCH_TEXT}, NOW() - INTERVAL '1 day')
    RETURNING user_search_notification_id AS id
  `)
  await pg.queryAsync(sql`
    INSERT INTO user_search_notification__store (user_search_notification_id, store_id)
    SELECT ${id}, store_id FROM store WHERE store_name = 'Bandcamp'
  `)
  return id
}

const eventTrackIds = async (userId) =>
  (
    await pg.queryRowsAsync(sql`
      SELECT track_id FROM user_notification_event WHERE meta_account_user_id = ${userId} ORDER BY track_id
    `)
  ).map(({ track_id }) => track_id)

const queuedEmails = async () =>
  pg.queryRowsAsync(sql`SELECT email_queue_plain AS plain FROM email_queue WHERE email_queue_recipient = ${VERIFIED_EMAIL}`)

test({
  setup: async () => {
    await initDb()
    const verifiedUserId = await createUser(VERIFIED_EMAIL)
    const unverifiedUserId = await createUser(null)
    const verifiedNotificationId = await subscribe(verifiedUserId)
    const unverifiedNotificationId = await subscribe(unverifiedUserId)
    const seeded = await addBandcampTracks([bandcampTrack(1), bandcampTrack(2)], [])
    return {
      verifiedUserId,
      unverifiedUserId,
      verifiedNotificationId,
      unverifiedNotificationId,
      addedTracks: seeded.addedTracks,
      addedSources: [seeded.sourceId],
    }
  },

  teardown: async (ctx) => {
    await pg.queryAsync(sql`DELETE FROM email_queue WHERE email_queue_recipient = ${VERIFIED_EMAIL}`)
    for (const userId of [ctx.verifiedUserId, ctx.unverifiedUserId]) {
      await pg.queryAsync(sql`DELETE FROM user_search_notification WHERE meta_account_user_id = ${userId}`)
      await pg.queryAsync(sql`DELETE FROM meta_account_email WHERE meta_account_user_id = ${userId}`)
      await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userId}`)
    }
    await teardownTracks(ctx)
  },

  'records events for verified and unverified subscribers and emails only the verified one': async ({
    verifiedUserId,
    unverifiedUserId,
    addedTracks,
  }) => {
    await updateNotifications()

    const expected = [...addedTracks].sort((a, b) => a - b)
    assert.deepStrictEqual(await eventTrackIds(verifiedUserId), expected)
    assert.deepStrictEqual(await eventTrackIds(unverifiedUserId), expected)
    const emails = await queuedEmails()
    assert.strictEqual(emails.length, 1)
    assert.match(emails[0].plain, new RegExp(`${SEARCH_TEXT} track 1`))
  },

  'does not duplicate events when the same window is processed again': async ({
    verifiedUserId,
    verifiedNotificationId,
    unverifiedNotificationId,
  }) => {
    await pg.queryAsync(sql`
      UPDATE user_search_notification SET user_search_notification_last_update = NOW() - INTERVAL '1 day'
      WHERE user_search_notification_id IN (${verifiedNotificationId}, ${unverifiedNotificationId})
    `)
    await updateNotifications()
    assert.strictEqual((await eventTrackIds(verifiedUserId)).length, 2)
  },

  'unsubscribing removes the subscription events': async ({ unverifiedUserId, unverifiedNotificationId }) => {
    await pg.queryAsync(
      sql`DELETE FROM user_search_notification WHERE user_search_notification_id = ${unverifiedNotificationId}`,
    )
    assert.deepStrictEqual(await eventTrackIds(unverifiedUserId), [])
  },
})
