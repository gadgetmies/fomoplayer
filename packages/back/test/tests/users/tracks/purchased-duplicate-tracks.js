const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const { initDb, pg } = require('../../../lib/db.js')
const sql = require('sql-template-strings')
const assert = require('assert')
const { test } = require('cascade-test')
const beatportLibrary = require('../../../fixtures/my-beatport.json')
const { updateDates } = require('../../../lib/fixture-utils')
const { addPurchasedBeatportTracksToDb } = require('../../../lib/tracks.js')
const { addPurchasedTracksToUsers } = require('../../../../routes/users/db.js')
const { resolveTestUserId } = require('../../../lib/test-user')

// Regression for the Beatport "My library" send. A track that resolves to
// multiple store URLs is returned once per URL by queryStoredTracksForUrls, so
// the purchased-tracks payload can legitimately contain the same track_id more
// than once. The cross join with the purchased cart then produced duplicate
// (cart_id, track_id) tuples in a single INSERT ... ON CONFLICT DO UPDATE, which
// Postgres rejects with: "ON CONFLICT DO UPDATE command cannot affect row a
// second time". addPurchasedTracksToUsers must dedupe and keep the earliest
// purchase timestamp.
const purchasedCartRows = (userId, trackId) =>
  pg.queryRowsAsync(
    sql`SELECT track__cart_added
        FROM track__cart NATURAL JOIN cart
        WHERE cart_is_purchased AND meta_account_user_id = ${userId} AND track_id = ${trackId}`,
  )

test({
  'sending purchased tracks containing a duplicate track_id': {
    setup: async () => {
      await initDb()
      const userId = await resolveTestUserId()
      await addPurchasedBeatportTracksToDb(updateDates()(beatportLibrary), [userId])
      const [{ track_id: trackId }] = await pg.queryRowsAsync(sql`SELECT track_id FROM track LIMIT 1`)
      const earlier = '2020-01-01T00:00:00.000Z'
      const later = '2020-02-01T00:00:00.000Z'
      // The same track_id twice (it resolved to two store URLs) — the bug trigger.
      await addPurchasedTracksToUsers(
        [userId],
        [
          { trackId, purchased: later },
          { trackId, purchased: earlier },
        ],
      )
      return { userId, trackId, earlier }
    },
    'inserts the track exactly once into the purchased cart': async ({ userId, trackId }) => {
      const rows = await purchasedCartRows(userId, trackId)
      assert.strictEqual(rows.length, 1)
    },
    'keeps the earliest purchase timestamp': async ({ userId, trackId, earlier }) => {
      const [{ track__cart_added }] = await purchasedCartRows(userId, trackId)
      assert.strictEqual(new Date(track__cart_added).toISOString(), earlier)
    },
    teardown: async () => {
      await initDb()
    },
  },
  teardown: async () => {
    spotifyInterceptor.dispose()
  },
})
