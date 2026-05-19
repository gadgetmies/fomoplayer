const spotifyInterceptor = require('fomoplayer_shared').interceptors.spotify.init()
const L = require('partial.lenses')
const R = require('ramda')
const assert = require('assert')
const sql = require('sql-template-strings')
const { test } = require('cascade-test')

const { initDb, pg } = require('../../../lib/db.js')
const { setupBeatportTracks, teardownTracks } = require('../../../lib/tracks.js')
const { updateDates } = require('../../../lib/fixture-utils.js')
const { resolveTestUserId } = require('../../../lib/test-user')

const {
  getNotificationTracks,
  updateNotifications,
  setTrackHeard,
} = require('../../../../routes/users/logic.js')

const concussionFixture = require('../../../fixtures/noisia_concussion_beatport.json')
const purposeFixture = require('../../../fixtures/noisia_purpose_beatport.json')

const updateDatesToToday = updateDates()

const otherArtistFixture = R.pipe(
  L.modify(L.query(['data', 'id']), R.always(99999)),
  L.modify(L.query('isrc'), R.always('OTHR000001')),
  L.modify(L.query('catalog_number'), R.always('OTHR001')),
  L.modify([L.query('release'), 'id'], R.always(99999)),
  L.modify(L.query('artists'), (artists) =>
    artists.map((a) => ({ ...a, id: 99999, name: 'Other Artist', slug: 'other-artist' })),
  ),
)(concussionFixture)

const getTrackArtistId = async (trackIds) => {
  const [{ artistId }] = await pg.queryRowsAsync(
    sql`SELECT MIN(artist_id) AS "artistId" FROM track NATURAL JOIN track__artist WHERE track_id = ANY(${trackIds})`,
  )
  return artistId
}

const getTrackLabelId = async (trackIds) => {
  const [{ labelId }] = await pg.queryRowsAsync(
    sql`SELECT MIN(label_id) AS "labelId" FROM track NATURAL JOIN track__label WHERE track_id = ANY(${trackIds})`,
  )
  return labelId
}

const clearUserNotifications = async (userId) => {
  const existing = await pg.queryRowsAsync(
    sql`SELECT user_search_notification_string AS text,
               LOWER(store_name) AS "storeName"
        FROM user_search_notification
               NATURAL JOIN user_search_notification__store
               NATURAL JOIN store
        WHERE meta_account_user_id = ${userId}`,
  )
  if (existing.length > 0) {
    await updateNotifications(
      userId,
      existing.map(({ text, storeName }) => ({ op: 'remove', text, storeName })),
    )
  }
}

const addNotification = (userId, text, storeName) =>
  updateNotifications(userId, [{ op: 'add', text, storeName }])

const setTrackAddedRaw = (trackId, isoTimestamp) =>
  pg.queryAsync(sql`UPDATE track SET track_added = ${isoTimestamp}::TIMESTAMPTZ WHERE track_id = ${trackId}`)

const countDbStatements = async (fn) => {
  let count = 0
  const originalQueryRowsAsync = pg.queryRowsAsync
  const originalQueryAsync = pg.queryAsync
  const originalGetTransaction = pg.getTransaction
  pg.queryRowsAsync = function (...args) {
    count++
    return originalQueryRowsAsync.apply(this, args)
  }
  pg.queryAsync = function (...args) {
    count++
    return originalQueryAsync.apply(this, args)
  }
  pg.getTransaction = function (...args) {
    const txPromise = originalGetTransaction.apply(this, args)
    return txPromise.then((tx) => {
      const originalTxRows = tx.queryRowsAsync.bind(tx)
      const originalTxQuery = tx.queryAsync.bind(tx)
      tx.queryRowsAsync = (...a) => {
        count++
        return originalTxRows(...a)
      }
      tx.queryAsync = (...a) => {
        count++
        return originalTxQuery(...a)
      }
      return tx
    })
  }
  try {
    const result = await fn()
    return { count, result }
  } finally {
    pg.queryRowsAsync = originalQueryRowsAsync
    pg.queryAsync = originalQueryAsync
    pg.getTransaction = originalGetTransaction
  }
}

test({
  setup: async () => {
    await initDb()
    return { userId: await resolveTestUserId() }
  },

  'user with no active notifications gets empty response': async ({ userId }) => {
    await clearUserNotifications(userId)
    const result = await getNotificationTracks(userId, null, 20, 0)
    assert.deepStrictEqual(result.tracks, [])
    assert.deepStrictEqual(result.pagination, { offset: 0, count: 0, total: 0 })
  },

  'with one Beatport track and a matching artist notification': {
    setup: async ({ userId }) => {
      await clearUserNotifications(userId)
      const result = await setupBeatportTracks([{ tracks: updateDatesToToday(concussionFixture) }], false, [userId])
      const artistId = await getTrackArtistId(result.addedTracks)
      const labelId = await getTrackLabelId(result.addedTracks)
      await addNotification(userId, `artist:${artistId}`, 'beatport')
      return { ...result, userId, artistId, labelId }
    },
    teardown: async (ctx) => {
      await clearUserNotifications(ctx.userId)
      await teardownTracks(ctx)
    },

    'artist:NNN notification surfaces the track': async ({ userId }) => {
      const { tracks, pagination } = await getNotificationTracks(userId, null, 20, 0)
      assert.strictEqual(tracks.length, 1)
      assert.strictEqual(tracks[0].title, 'Concussion')
      assert.strictEqual(pagination.total, 1)
      assert.strictEqual(pagination.offset, 0)
      assert.strictEqual(pagination.count, 1)
    },

    'heard track is excluded': async ({ userId, addedTracks }) => {
      await setTrackHeard(addedTracks[0], userId, true)
      try {
        const { tracks, pagination } = await getNotificationTracks(userId, null, 20, 0)
        assert.strictEqual(tracks.length, 0)
        assert.strictEqual(pagination.total, 0)
      } finally {
        await setTrackHeard(addedTracks[0], userId, false)
      }
    },

    'label:NNN notification with same track surfaces it via labels too': async ({
      userId,
      labelId,
      artistId,
    }) => {
      // Add a second notification on the same store, by label
      await addNotification(userId, `label:${labelId}`, 'beatport')
      try {
        const { tracks, pagination } = await getNotificationTracks(userId, null, 20, 0)
        // Same track matches both notifications; should appear once
        assert.strictEqual(tracks.length, 1, 'dedup across notifications should yield exactly one row')
        assert.strictEqual(pagination.total, 1)
      } finally {
        await updateNotifications(userId, [{ op: 'remove', text: `label:${labelId}`, storeName: 'beatport' }])
      }
    },

    'free-text notification matches by track title': async ({ userId, artistId }) => {
      await updateNotifications(userId, [{ op: 'remove', text: `artist:${artistId}`, storeName: 'beatport' }])
      await addNotification(userId, 'concussion', 'beatport')
      try {
        const { tracks } = await getNotificationTracks(userId, null, 20, 0)
        assert.strictEqual(tracks.length, 1)
        assert.strictEqual(tracks[0].title, 'Concussion')
      } finally {
        await updateNotifications(userId, [{ op: 'remove', text: 'concussion', storeName: 'beatport' }])
        await addNotification(userId, `artist:${artistId}`, 'beatport')
      }
    },

    'composite notification (artist:NNN + text) is AND': async ({ userId, artistId }) => {
      await updateNotifications(userId, [{ op: 'remove', text: `artist:${artistId}`, storeName: 'beatport' }])
      await addNotification(userId, `artist:${artistId} concussion`, 'beatport')
      try {
        const { tracks } = await getNotificationTracks(userId, null, 20, 0)
        assert.strictEqual(tracks.length, 1)
        assert.strictEqual(tracks[0].title, 'Concussion')
      } finally {
        await updateNotifications(userId, [
          { op: 'remove', text: `artist:${artistId} concussion`, storeName: 'beatport' },
        ])
        await addNotification(userId, `artist:${artistId}`, 'beatport')
      }
    },

    'store=bandcamp filter drops the Beatport-only notification': async ({ userId }) => {
      const { tracks, pagination } = await getNotificationTracks(userId, ['bandcamp'], 20, 0)
      assert.strictEqual(tracks.length, 0)
      assert.strictEqual(pagination.total, 0)
    },
  },

  'with two tracks by the same artist (pagination + ordering)': {
    setup: async ({ userId }) => {
      await clearUserNotifications(userId)
      const result = await setupBeatportTracks(
        [
          { tracks: updateDatesToToday(concussionFixture) },
          { tracks: updateDatesToToday(purposeFixture) },
        ],
        false,
        [userId],
      )
      const artistId = await getTrackArtistId(result.addedTracks)
      // Stagger track_added so ordering is deterministic
      const now = Date.now()
      await setTrackAddedRaw(result.addedTracks[0], new Date(now - 60_000).toISOString())
      await setTrackAddedRaw(result.addedTracks[1], new Date(now).toISOString())
      await addNotification(userId, `artist:${artistId}`, 'beatport')
      return { ...result, userId, artistId }
    },
    teardown: async (ctx) => {
      await clearUserNotifications(ctx.userId)
      await teardownTracks(ctx)
    },

    'tracks are ordered most-recently-added first': async ({ userId, addedTracks }) => {
      const { tracks } = await getNotificationTracks(userId, null, 20, 0)
      const ids = tracks.map((t) => t.id)
      assert.deepStrictEqual(ids, [addedTracks[1], addedTracks[0]])
    },

    'pagination yields disjoint successive pages': async ({ userId, addedTracks }) => {
      const page1 = await getNotificationTracks(userId, null, 1, 0)
      const page2 = await getNotificationTracks(userId, null, 1, 1)
      assert.strictEqual(page1.tracks.length, 1)
      assert.strictEqual(page2.tracks.length, 1)
      assert.notStrictEqual(page1.tracks[0].id, page2.tracks[0].id)
      assert.deepStrictEqual([page1.tracks[0].id, page2.tracks[0].id], [addedTracks[1], addedTracks[0]])
      assert.strictEqual(page1.pagination.total, 2)
      assert.strictEqual(page2.pagination.total, 2)
    },
  },

  'no per-notification DB fan-out': {
    setup: async ({ userId }) => {
      await clearUserNotifications(userId)
      const result = await setupBeatportTracks([{ tracks: updateDatesToToday(concussionFixture) }], false, [userId])
      const artistId = await getTrackArtistId(result.addedTracks)
      const labelId = await getTrackLabelId(result.addedTracks)
      return { ...result, userId, artistId, labelId }
    },
    teardown: async (ctx) => {
      await clearUserNotifications(ctx.userId)
      await teardownTracks(ctx)
    },

    'statement count is independent of notification count': async ({ userId, artistId, labelId }) => {
      await clearUserNotifications(userId)
      await addNotification(userId, `artist:${artistId}`, 'beatport')
      const { count: oneCount } = await countDbStatements(() => getNotificationTracks(userId, null, 20, 0))

      // Add four more notifications
      await addNotification(userId, `label:${labelId}`, 'beatport')
      await addNotification(userId, 'concussion', 'beatport')
      await addNotification(userId, `artist:${artistId} concussion`, 'beatport')
      await addNotification(userId, `label:${labelId} concussion`, 'beatport')

      const { count: fiveCount } = await countDbStatements(() => getNotificationTracks(userId, null, 20, 0))

      assert.strictEqual(
        oneCount,
        fiveCount,
        `expected statement count to be independent of notification count, got ${oneCount} (1 notif) vs ${fiveCount} (5 notifs)`,
      )
    },
  },

  teardown: async () => {
    spotifyInterceptor.dispose()
  },
})
