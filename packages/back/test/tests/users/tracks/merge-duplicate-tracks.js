const L = require('partial.lenses')
const R = require('ramda')
const { initDb, pg } = require('../../../lib/db.js')
const assert = require('assert')
const { test } = require('../../../lib/test.js')
const { addNewBeatportTracksToDb } = require('../../../lib/tracks.js')
const track = require('../../../fixtures/monty_track.json')
const modifiedTrack = L.modify(L.seq(['id'], ['release', 'id']), R.inc, track)
const remixedTrack = R.pipe(
  L.modify(L.seq(['id'], ['release', 'id']), R.inc),
  R.flip(R.merge)({
    mix: 'Remix',
    remixers: [
      {
        id: 386795,
        name: 'Sigrah',
        slug: 'sigrah'
      }
    ]
  })
)(track)
const editOfRemixedTrack = R.pipe(L.modify(L.seq(['id'], ['release', 'id']), R.inc), L.set('mix', 'Edit'))(remixedTrack)

test({
  'when duplicate tracks are added': {
    setup: async () => {
      await initDb()
      await addNewBeatportTracksToDb([track])
      await addNewBeatportTracksToDb([modifiedTrack])
    },
    'only one track is added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 1)
    },
    teardown: async () => {
      // await db.initDb()
    }
  },
  'when remixed track is added': {
    setup: async () => {
      await initDb()
      await addNewBeatportTracksToDb([track])
      await addNewBeatportTracksToDb([remixedTrack])
    },
    'only both tracks are added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 2)
    },
    teardown: async () => {
      // await initDb()
    }
  },
  'when an edit of remixed track is added': {
    setup: async () => {
      await initDb()
      await addNewBeatportTracksToDb([remixedTrack])
      await addNewBeatportTracksToDb([editOfRemixedTrack])
    },
    'only both tracks are added to db': async () => {
      const [{ trackCount }] = await pg.queryRowsAsync('select count(*) :: INT as "trackCount" from track')
      assert.strictEqual(trackCount, 2)
    },
    teardown: async () => {
      // await db.initDb()
    }
  }
})
