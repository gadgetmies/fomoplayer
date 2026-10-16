const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()

const { initDb, pg } = require('../../lib/db')
const { seedTracks } = require('../../lib/seed')
const { teardownTracks } = require('../../lib/tracks')
const { resolveTestUserId } = require('../../lib/test-user')

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    return seedTracks({ userIds: [userId] })
  },
  teardown: async (ctx) => {
    await teardownTracks(ctx)
    spotifyInterceptor.dispose()
  },

  "the store's track details are stored in store__track_store_details, one row per store track": async ({
    addedTracks,
  }) => {
    const rows = await pg.queryRowsAsync(sql`
SELECT store__track_id
     , store__track_store_id
     , details.store__track_store_details ->> 'id' AS details_store_track_id
FROM store__track
  -- USING rather than NATURAL: until 20261017130000 drops it, store__track still has a (NULL) column with the same name
  LEFT JOIN store__track_store_details AS details USING (store__track_id)
WHERE track_id = ANY (${addedTracks})`)
    assert.ok(rows.length > 0, 'the seeded tracks must have store__track rows')
    for (const { store__track_id, store__track_store_id, details_store_track_id } of rows) {
      assert.strictEqual(
        String(details_store_track_id),
        String(store__track_store_id),
        `store__track ${store__track_id} must have its store details`,
      )
    }
  },
})
