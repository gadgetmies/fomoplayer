const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()

const { initDb, pg } = require('../../../lib/db')
const { seedTracks } = require('../../../lib/seed')
const { teardownTracks } = require('../../../lib/tracks')
const { resolveTestUserId } = require('../../../lib/test-user')
const { queryUserTracks } = require('../../../../routes/users/db')

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const seeded = await seedTracks({ userIds: [userId] })

    // Another user follows and stars every artist and label of the test user's tracks.
    const [{ meta_account_user_id: otherUserId }] = await pg.queryRowsAsync(
      sql`INSERT INTO meta_account DEFAULT VALUES RETURNING meta_account_user_id`,
    )
    await pg.queryRowsAsync(sql`
INSERT INTO store__artist_watch (store__artist_id)
SELECT DISTINCT store__artist_id FROM track__artist NATURAL JOIN store__artist WHERE track_id = ANY (${seeded.addedTracks})
ON CONFLICT DO NOTHING`)
    await pg.queryRowsAsync(sql`
INSERT INTO store__artist_watch__user (store__artist_watch_id, meta_account_user_id, store__artist_watch__user_starred)
SELECT DISTINCT store__artist_watch_id, ${otherUserId} :: INT, TRUE
FROM track__artist NATURAL JOIN store__artist NATURAL JOIN store__artist_watch
WHERE track_id = ANY (${seeded.addedTracks})`)
    await pg.queryRowsAsync(sql`
INSERT INTO store__label_watch (store__label_id)
SELECT DISTINCT store__label_id FROM track__label NATURAL JOIN store__label WHERE track_id = ANY (${seeded.addedTracks})
ON CONFLICT DO NOTHING`)
    await pg.queryRowsAsync(sql`
INSERT INTO store__label_watch__user (store__label_watch_id, meta_account_user_id, store__label_watch__user_starred)
SELECT DISTINCT store__label_watch_id, ${otherUserId} :: INT, TRUE
FROM track__label NATURAL JOIN store__label NATURAL JOIN store__label_watch
WHERE track_id = ANY (${seeded.addedTracks})`)

    return { userId, otherUserId, ...seeded }
  },
  teardown: async (ctx) => {
    await pg.queryRowsAsync(sql`DELETE FROM store__artist_watch__user WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await pg.queryRowsAsync(sql`DELETE FROM store__label_watch__user WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await pg.queryRowsAsync(sql`DELETE FROM meta_account WHERE meta_account_user_id = ${ctx.otherUserId}`)
    await teardownTracks(ctx)
    spotifyInterceptor.dispose()
  },

  "another user's follows and stars do not affect the user's track scores": async ({ userId }) => {
    const { lists } = await queryUserTracks(userId)
    assert.ok(lists.new.tracks.length > 0, 'the user must have new tracks')
    for (const { track_id, score_details } of lists.new.tracks) {
      assert.strictEqual(score_details.artist_follow.score, 0, `artist_follow score of track ${track_id}`)
      assert.strictEqual(score_details.label_follow.score, 0, `label_follow score of track ${track_id}`)
      assert.strictEqual(score_details.artists_starred, 0, `artists_starred of track ${track_id}`)
      assert.strictEqual(score_details.label_starred, false, `label_starred of track ${track_id}`)
    }
  },
})
