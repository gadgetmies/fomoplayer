const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()

const { initDb, pg } = require('../../../lib/db')
const { seedTracks } = require('../../../lib/seed')
const { teardownTracks } = require('../../../lib/tracks')
const { resolveTestUserId } = require('../../../lib/test-user')
const { queryUserTracks, USER_TRACK_LISTS } = require('../../../../routes/users/db')

const EXTRA_STORE_TRACK_ID = 'multi-store-duplicates-test'

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const seeded = await seedTracks({ userIds: [userId] })
    const [trackId] = seeded.addedTracks

    // A track available in more than one store has a store__track row per store.
    await pg.queryRowsAsync(sql`
INSERT INTO store__track (track_id, store_id, store__track_store_id, store__track_store_details)
SELECT track_id, store_id, ${EXTRA_STORE_TRACK_ID}, '{}'::JSONB
FROM store__track
WHERE track_id = ${trackId}
LIMIT 1`)
    await pg.queryRowsAsync(
      sql`UPDATE user__track SET user__track_heard = NOW() WHERE track_id = ${trackId} AND meta_account_user_id = ${userId}`,
    )

    return { userId, trackId, ...seeded }
  },
  teardown: async (ctx) => {
    await pg.queryRowsAsync(sql`DELETE FROM store__track WHERE store__track_store_id = ${EXTRA_STORE_TRACK_ID}`)
    await teardownTracks(ctx)
    spotifyInterceptor.dispose()
  },

  'a track with several store__track rows is returned once in every list': async ({ userId, trackId }) => {
    const notHeardBefore = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const result = await queryUserTracks(userId, { notHeardBefore })
    assert.ok(
      result.lists.heard.tracks.some((t) => t.track_id === trackId),
      'the heard track must be in the heard list',
    )
    for (const list of USER_TRACK_LISTS) {
      const ids = result.lists[list].tracks.map((t) => t.track_id)
      assert.deepStrictEqual(ids, [...new Set(ids)], `${list} list must not contain duplicate tracks`)
    }
  },

  'a track with several store__track rows fills only one slot when paging the heard list': async ({ userId }) => {
    const page = (offset) =>
      queryUserTracks(userId, {
        limits: { new: 0, heard: 1, recentlyAdded: 0 },
        offsets: { new: 0, heard: offset, recentlyAdded: 0 },
      })
    const first = await page(0)
    assert.strictEqual(first.lists.heard.page.total, 1)
    assert.strictEqual(first.lists.heard.tracks.length, 1)
    const second = await page(1)
    assert.deepStrictEqual(
      second.lists.heard.tracks.map((t) => t.track_id),
      [],
      'the second page must be empty: the only heard track must not be repeated',
    )
  },
})
