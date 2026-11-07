const assert = require('assert')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db')
const { queryNotifications } = require('../../../routes/users/db')

// Artist and label subscriptions (artist:<id> / label:<id>) are listed by the entity's name.

test({
  setup: async () => {
    await initDb()
    const [{ id: userId }] = await pg.queryRowsAsync(
      sql`INSERT INTO meta_account DEFAULT VALUES RETURNING meta_account_user_id AS id`,
    )
    const [{ artist_id: artistId }] = await pg.queryRowsAsync(
      sql`INSERT INTO artist (artist_name) VALUES ('Display Name Artist') RETURNING artist_id`,
    )
    const [{ label_id: labelId }] = await pg.queryRowsAsync(
      sql`INSERT INTO label (label_name) VALUES ('Display Name Label') RETURNING label_id`,
    )
    for (const text of [`artist:${artistId}`, `label:${labelId}`, 'plain search']) {
      const [{ id }] = await pg.queryRowsAsync(sql`
        INSERT INTO user_search_notification (meta_account_user_id, user_search_notification_string)
        VALUES (${userId}, ${text}) RETURNING user_search_notification_id AS id
      `)
      await pg.queryAsync(sql`
        INSERT INTO user_search_notification__store (user_search_notification_id, store_id)
        SELECT ${id}, store_id FROM store WHERE store_name = 'Beatport'
      `)
    }
    return { userId, artistId, labelId }
  },

  teardown: async ({ userId, artistId, labelId }) => {
    await pg.queryAsync(sql`DELETE FROM user_search_notification WHERE meta_account_user_id = ${userId}`)
    await pg.queryAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${userId}`)
    await pg.queryAsync(sql`DELETE FROM artist WHERE artist_id = ${artistId}`)
    await pg.queryAsync(sql`DELETE FROM label WHERE label_id = ${labelId}`)
  },

  'artist and label subscriptions are named after the entity': async ({ userId, artistId, labelId }) => {
    const byText = Object.fromEntries((await queryNotifications(userId)).map((n) => [n.text, n.displayName]))
    assert.deepStrictEqual(byText, {
      [`artist:${artistId}`]: 'Display Name Artist',
      [`label:${labelId}`]: 'Display Name Label',
      'plain search': 'plain search',
    })
  },
})
