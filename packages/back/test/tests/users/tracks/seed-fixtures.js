const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const { initDb, pg } = require('../../../lib/db')
const { seedTracks, seededTrackAssertions } = require('../../../lib/seed')
const { teardownTracks } = require('../../../lib/tracks')
const { resolveTestUserId } = require('../../../lib/test-user')

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const seeded = await seedTracks({ userIds: [userId] })
    return { userId, ...seeded }
  },
  teardown: async (ctx) => {
    await teardownTracks(ctx)
    spotifyInterceptor.dispose()
  },

  'seed tracks are inserted and linked to user': async ({ userId }) => {
    const expectedIds = seededTrackAssertions.ids
    assert.ok(expectedIds.length > 0, 'seed fixture assertions should contain track ids')

    const userTracks = await pg.queryRowsAsync(
      sql`SELECT st.store__track_store_id::text AS "id", t.track_title AS title
          FROM user__track ut
          JOIN track t ON ut.track_id = t.track_id
          JOIN store__track st ON t.track_id = st.track_id
          WHERE ut.meta_account_user_id = ${userId}
            AND st.store__track_store_id::text = ANY(${expectedIds})
          ORDER BY st.store__track_store_id::text`,
    )
    const foundIds = userTracks.map(({ id }) => id).sort()
    const missingIds = expectedIds.filter((id) => !foundIds.includes(id)).sort()
    assert.deepStrictEqual(missingIds, [], `missing seeded track ids in user__track: ${missingIds.join(', ')}`)

    const foundTitles = userTracks.map(({ title }) => title).sort()
    const expectedTitles = [...seededTrackAssertions.titles].sort()
    assert.deepStrictEqual(foundTitles, expectedTitles, 'seeded track titles should match the fixture transform')
  },
})
