const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')
const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()

const { initDb, pg } = require('../../../lib/db')
const { seedTracks } = require('../../../lib/seed')
const { teardownTracks } = require('../../../lib/tracks')
const { resolveTestUserId } = require('../../../lib/test-user')
const { queryUserTracks } = require('../../../../routes/users/db')

const setTrackAdded = (trackId, isoTimestamp) =>
  pg.queryRowsAsync(
    sql`UPDATE track SET track_added = ${isoTimestamp}::TIMESTAMPTZ WHERE track_id = ${trackId}`,
  )

test({
  setup: async () => {
    await initDb()
    const userId = await resolveTestUserId()
    const seeded = await seedTracks({ userIds: [userId] })
    const trackIds = seeded.addedTracks
    assert.ok(
      trackIds.length >= 4,
      `seed fixture must produce at least 4 tracks for this test (got ${trackIds.length})`,
    )

    // Stagger track_added so insertion order is the REVERSE of age order:
    // the first-inserted row is the oldest, the last-inserted is the newest.
    // This ensures that a no-ORDER-BY heap scan can never accidentally
    // return the most-recent slice — the planner has to do a real sort.
    // The last two also share a calendar day to exercise within-day
    // stability (full-timestamp resolution, not just date).
    const now = Date.now()
    const day = 24 * 60 * 60 * 1000
    const minute = 60 * 1000
    const N = trackIds.length
    const offsets = trackIds.map((_, i) => {
      if (i === N - 1) return 5 * minute        // newest
      if (i === N - 2) return 60 * minute       // 55 min older, same calendar day
      return (N - i) * day                      // older as i decreases
    })
    for (let i = 0; i < trackIds.length; i++) {
      await setTrackAdded(trackIds[i], new Date(now - offsets[i]).toISOString())
    }

    // Expose the chronological order (newest → oldest) so assertions don't
    // have to reason about insertion-order indexing.
    const byAgeDesc = [...trackIds].reverse()

    return { userId, trackIds, byAgeDesc, ...seeded }
  },
  teardown: async (ctx) => {
    await teardownTracks(ctx)
    spotifyInterceptor.dispose()
  },

  'recentlyAdded slice picks the K most-recent tracks in track_added DESC order': async ({
    userId,
    byAgeDesc,
  }) => {
    const K = 3
    const result = await queryUserTracks(
      userId,
      undefined,
      { new: 0, recent: K, heard: 0 },
      { new: 0, recent: 0, heard: 0 },
    )
    const returnedIds = result.tracks.recentlyAdded.map((t) => t.track_id)
    assert.strictEqual(returnedIds.length, K, `expected exactly ${K} entries, got ${returnedIds.length}`)
    assert.deepStrictEqual(
      returnedIds,
      byAgeDesc.slice(0, K),
      'recentlyAdded slice must contain the K most-recent track ids in DESC order by track_added',
    )
  },

  'recentlyAdded ordering is stable for tracks added on the same calendar day': async ({
    userId,
    byAgeDesc,
  }) => {
    const result = await queryUserTracks(
      userId,
      undefined,
      { new: 0, recent: 2, heard: 0 },
      { new: 0, recent: 0, heard: 0 },
    )
    const returnedIds = result.tracks.recentlyAdded.map((t) => t.track_id)
    // The two newest share a calendar day; the strictly-newer one must come first.
    assert.deepStrictEqual(
      returnedIds,
      byAgeDesc.slice(0, 2),
      'within a calendar day, the later track_added timestamp must come first',
    )
  },

  'recentlyAdded slice respects offset': async ({ userId, byAgeDesc }) => {
    const result = await queryUserTracks(
      userId,
      undefined,
      { new: 0, recent: 2, heard: 0 },
      { new: 0, recent: 1, heard: 0 },
    )
    const returnedIds = result.tracks.recentlyAdded.map((t) => t.track_id)
    // With offset=1 and limit=2, expect items at positions 1 and 2 of the
    // DESC-sorted catalogue.
    assert.deepStrictEqual(
      returnedIds,
      byAgeDesc.slice(1, 3),
      'recentlyAdded with offset must skip the freshest entries and resume in DESC order',
    )
  },
})
