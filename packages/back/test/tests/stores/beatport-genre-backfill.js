const assert = require('assert')
const BPromise = require('bluebird')
const { test } = require('cascade-test')
const sql = require('sql-template-strings')
const { initDb, pg } = require('../../lib/db.js')
const { addNewBeatportTracksToDb } = require('../../lib/tracks.js')
const { resolveTestUserId } = require('../../lib/test-user')
const bpApi = require('../../../routes/stores/beatport/bp-api')
const { backfillBeatportGenres } = require('../../../scripts/backfill-beatport-genres')
const { addGenresToTrack } = require('../../../routes/shared/db/store')
const trackFixture = require('../../fixtures/noisia_block_control_beatport.json')

const rawTrack = trackFixture.pageProps.dehydratedState.queries[0].state.data
const subGenre = {
  id: 7,
  name: 'Neurofunk',
  slug: 'neurofunk',
  url: 'https://api.beatport.com/v4/catalog/sub-genres/7/',
}
// What the v4 API returns for the track today: the genre plus a sub_genre.
const upstreamTrack = { ...rawTrack, sub_genre: subGenre }

// The stored copy was ingested from a payload without genre data.
const withoutGenre = () => {
  const fixture = structuredClone(trackFixture)
  const data = fixture.pageProps.dehydratedState.queries[0].state.data
  data.genre = null
  data.sub_genre = null
  return fixture
}

const queryTrackGenres = () =>
  pg.queryRowsAsync(sql`
SELECT genre_name AS name
FROM track__genre NATURAL JOIN genre NATURAL JOIN store__track
WHERE store__track_store_id = ${String(rawTrack.id)}
ORDER BY genre_name`)

const queryTrackDetailsGenres = async () =>
  (
    await pg.queryRowsAsync(sql`
SELECT track_details->'genres' AS genres
FROM track_details NATURAL JOIN store__track
WHERE store__track_store_id = ${String(rawTrack.id)}`)
  )[0].genres.map(({ name }) => name)

const silent = () => {}

test({
  setup: async () => {
    const original = { getTracksByIds: bpApi.getTracksByIds, getTrack: bpApi.getTrack }
    const calls = []
    bpApi.getTracksByIds = async (ids) => {
      calls.push(['getTracksByIds', ids])
      return ids.includes(String(rawTrack.id)) ? [upstreamTrack] : []
    }
    bpApi.getTrack = async (id) => {
      calls.push(['getTrack', id])
      if (id === String(rawTrack.id)) return upstreamTrack
      throw new Error(`Beatport API request failed (404) for /catalog/tracks/${id}/`)
    }

    await initDb()
    const userId = await resolveTestUserId()
    await addNewBeatportTracksToDb(withoutGenre(), false, [userId])
    return { original, calls }
  },

  'the track is stored without genres': async () => {
    assert.deepStrictEqual(await queryTrackGenres(), [])
  },

  'a dry run reports the track but writes nothing': async () => {
    const stats = await backfillBeatportGenres({ log: silent })
    assert.strictEqual(stats.candidates, 1)
    assert.strictEqual(stats.updated, 1)
    assert.deepStrictEqual(await queryTrackGenres(), [])
  },

  'when applied': {
    setup: async () => ({ stats: await backfillBeatportGenres({ apply: true, concurrency: 4, log: silent }) }),

    'stores the genre and the sub-genre': async ({ stats }) => {
      assert.strictEqual(stats.updated, 1)
      assert.strictEqual(stats.failed, 0)
      assert.deepStrictEqual(
        (await queryTrackGenres()).map(({ name }) => name),
        ['Drum & Bass', 'Neurofunk'],
      )
    },

    'keys the store genres by Beatport id, not slug': async () => {
      const keys = await pg.queryRowsAsync(sql`
SELECT store__genre_store_id AS key
FROM store__genre NATURAL JOIN store
WHERE store_name = 'Beatport'
ORDER BY store__genre_store_id`)
      assert.deepStrictEqual(
        keys.map(({ key }) => key),
        ['genres/1', 'sub-genres/7'],
      )
    },

    'a slug-keyed genre from an older extension build resolves to the id-keyed row': async () => {
      const [{ trackId, storeId }] = await pg.queryRowsAsync(sql`
SELECT track_id AS "trackId", store_id AS "storeId"
FROM store__track
WHERE store__track_store_id = ${String(rawTrack.id)}`)
      await BPromise.using(pg.getTransaction(), (tx) =>
        addGenresToTrack(tx, storeId, trackId, [], [{ ...rawTrack.genre, id: rawTrack.genre.slug }]),
      )
      const keys = await pg.queryRowsAsync(sql`
SELECT store__genre_store_id AS key
FROM store__genre NATURAL JOIN store
WHERE store_name = 'Beatport'
ORDER BY store__genre_store_id`)
      assert.deepStrictEqual(
        keys.map(({ key }) => key),
        ['genres/1', 'sub-genres/7'],
      )
    },

    'a sub-genre sharing a genre name gets its own store genre, mapped to the same genre': async () => {
      // Beatport has e.g. both a genre and a sub-genre called "Pop".
      const [{ trackId, storeId }] = await pg.queryRowsAsync(sql`
SELECT track_id AS "trackId", store_id AS "storeId"
FROM store__track
WHERE store__track_store_id = ${String(rawTrack.id)}`)
      await BPromise.using(pg.getTransaction(), (tx) =>
        addGenresToTrack(tx, storeId, trackId, [], [{ id: 'sub-genres/999', name: 'Drum & Bass', url: 'u' }]),
      )
      const rows = await pg.queryRowsAsync(sql`
SELECT store__genre_store_id AS key, genre_id AS "genreId"
FROM store__genre NATURAL JOIN store
WHERE store_name = 'Beatport' AND store__genre_name = 'Drum & Bass'
ORDER BY store__genre_store_id`)
      assert.deepStrictEqual(
        rows.map(({ key }) => key),
        ['genres/1', 'sub-genres/999'],
      )
      assert.strictEqual(rows[0].genreId, rows[1].genreId)
      await pg.queryAsync(sql`DELETE FROM store__genre WHERE store__genre_store_id = 'sub-genres/999'`)
    },

    'refreshes track_details so track lists show the genres': async () => {
      assert.deepStrictEqual((await queryTrackDetailsGenres()).sort(), ['Drum & Bass', 'Neurofunk'])
    },

    'links the genres to the track artists': async () => {
      const [{ count }] = await pg.queryRowsAsync(sql`
SELECT COUNT(*)::INT AS count
FROM artist__genre NATURAL JOIN track__artist NATURAL JOIN store__track
WHERE store__track_store_id = ${String(rawTrack.id)}`)
      assert.ok(count > 0, 'expected artist__genre rows for the track artists')
    },

    'a second run finds nothing left to backfill': async () => {
      const stats = await backfillBeatportGenres({ apply: true, concurrency: 4, log: silent })
      assert.strictEqual(stats.candidates, 0)
    },

    '--include-existing revisits the track without duplicating rows': async () => {
      const stats = await backfillBeatportGenres({ apply: true, includeExisting: true, log: silent })
      assert.strictEqual(stats.candidates, 1)
      assert.strictEqual((await queryTrackGenres()).length, 2)
    },
  },

  teardown: async ({ original }) => {
    Object.assign(bpApi, original)
    await initDb()
  },
})
